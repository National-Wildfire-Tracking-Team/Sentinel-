"""
radar_service.py
FastAPI microservice for NOAA NEXRAD Level II radar tiles.

Endpoints:
  GET /api/radar/status          — metadata: stations, latest scan times
  GET /api/radar/stations        — list of all CONUS WSR-88D stations
  GET /api/radar/tiles/{product}/{z}/{x}/{y}.png
                                 — 256×256 PNG tile; ?t= for cache busting
  GET /health                    — liveness check

Run with:
  uvicorn radar_service:app --host 0.0.0.0 --port 8765 --workers 1
"""

import asyncio
import logging
import os
import struct
import zlib
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from nexrad_fetcher import NEXRADFetcher
from nexrad_processor import NEXRADProcessor, PRODUCTS
from stations import NEXRAD_STATIONS, STATION_MAP

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(name)s — %(message)s",
)
log = logging.getLogger("radar_service")

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Sentinel NEXRAD Radar Service",
    description="Real-time NOAA NEXRAD Level II tile server",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Singletons created at module level so startup handler can reference them
fetcher = NEXRADFetcher()
processor = NEXRADProcessor()

# Simple in-memory tile cache: (site_id, product, z, x, y, scan_key) → bytes
_tile_cache: dict[tuple, bytes] = {}
_TILE_CACHE_MAX = 2_000

# 1×1 transparent PNG (minimal valid file) returned for empty tiles
_TRANSPARENT_PNG = _make_transparent_png = None


def _build_transparent_png() -> bytes:
    """Build a minimal 256×256 all-transparent PNG."""
    width = height = 256
    # Raw image data: each row = filter byte (0) + 256×4 zero bytes
    raw_rows = b"\x00" + (b"\x00" * width * 4)
    raw_data = raw_rows * height
    compressed = zlib.compress(raw_data, 9)

    def chunk(name: bytes, data: bytes) -> bytes:
        c = name + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )
    return png


_TRANSPARENT_PNG = _build_transparent_png()


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    log.info("Starting NEXRAD polling loop…")
    asyncio.create_task(fetcher.run_polling_loop())
    # Kick off an immediate first poll
    asyncio.create_task(fetcher._poll_all_stations())


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/radar/status")
async def get_status():
    """Returns metadata about the latest scans for all stations."""
    latest = fetcher.get_latest_scan_time()
    return {
        "latestScanTime": latest.isoformat() if latest else None,
        "cachedStations": processor.get_cached_stations(),
        "stations": fetcher.get_station_status(),
        "products": list(PRODUCTS.keys()),
        "pollIntervalSeconds": 150,
    }


@app.get("/api/radar/stations")
async def get_stations():
    """Returns the full list of WSR-88D stations with coordinates."""
    return [
        {"siteId": sid, "name": name, "state": state, "lat": lat, "lon": lon}
        for sid, name, state, lat, lon in NEXRAD_STATIONS
    ]


@app.get("/api/radar/tiles/{product}/{z}/{x}/{y}.png")
async def get_tile(
    product: str,
    z: int,
    x: int,
    y: int,
    t: Optional[str] = Query(default=None, description="Cache-bust timestamp"),
    site: Optional[str] = Query(default=None, description="Override station ID"),
):
    """
    Serve a 256×256 RGBA PNG tile for the given XYZ tile coordinates.
    Tiles from multiple nearby stations are composited automatically.
    Use ?t=<epoch_ms> to bust the browser tile cache on new scans.
    """
    if product not in PRODUCTS:
        raise HTTPException(status_code=400, detail=f"Unknown product '{product}'. Valid: {list(PRODUCTS)}")
    if not (0 <= z <= 18 and x >= 0 and y >= 0):
        raise HTTPException(status_code=400, detail="Invalid tile coordinates")

    # Determine which stations to query
    station_ids = _stations_for_tile(z, x, y, override=site)

    # Ensure scan data is loaded for each candidate station
    for sid in station_ids:
        await _ensure_scan_loaded(sid)

    # Render composite tile (first station with data wins; could be blended later)
    tile_bytes = _render_composite_tile(product, z, x, y, station_ids)

    if tile_bytes is None:
        return Response(content=_TRANSPARENT_PNG, media_type="image/png",
                        headers={"Cache-Control": "no-cache", "X-Radar-Data": "empty"})

    return Response(
        content=tile_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=120",
            "X-Radar-Data": "present",
        },
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _stations_for_tile(z: int, x: int, y: int, override: Optional[str] = None) -> list[str]:
    """Return station IDs whose coverage likely overlaps the given tile."""
    if override:
        return [override.upper()]

    import math
    # Compute tile center lat/lon
    n = 2 ** z
    lon_c = (x + 0.5) / n * 360.0 - 180.0
    lat_c = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / n))))

    # Select nearest stations; more at low zoom, fewer at high zoom
    count = max(3, min(8, 20 - z))

    from stations import nearest_stations
    return nearest_stations(lat_c, lon_c, count=count)


async def _ensure_scan_loaded(site_id: str):
    """Download and process the latest scan for site_id if not already cached."""
    status = next((s for s in fetcher._status.values() if s.site_id == site_id), None)
    if not status or not status.latest_key:
        return

    if site_id in processor._scan_cache:
        cached = processor._scan_cache[site_id]
        if cached.scan_key == status.latest_key:
            return  # already up-to-date

    raw = await fetcher.get_latest_file(site_id)
    if raw:
        await processor.update_scan(site_id, status.latest_key, raw)


def _render_composite_tile(product: str, z: int, x: int, y: int, station_ids: list[str]) -> Optional[bytes]:
    """
    Try stations in order, merge tiles by taking max reflectivity per pixel
    (or first available for other products). Returns None if no data anywhere.
    """
    import numpy as np
    from PIL import Image
    import io

    composite: Optional[np.ndarray] = None  # RGBA uint8 (256, 256, 4)

    for sid in station_ids:
        cache_key = (sid, product, z, x, y)
        if cache_key in _tile_cache:
            tile_data = _tile_cache[cache_key]
        else:
            tile_data = processor.generate_tile(sid, product, z, x, y)
            if tile_data:
                if len(_tile_cache) >= _TILE_CACHE_MAX:
                    _tile_cache.pop(next(iter(_tile_cache)))
                _tile_cache[cache_key] = tile_data

        if tile_data is None:
            continue

        img = np.array(Image.open(io.BytesIO(tile_data)).convert("RGBA"), dtype=np.uint8)

        if composite is None:
            composite = img
        else:
            # Composite: where new tile has data (alpha > 0) and existing doesn't, use new
            has_new = img[:, :, 3] > 0
            has_old = composite[:, :, 3] > 0
            # Only new has data → fill gap
            fill_gap = has_new & ~has_old
            composite[fill_gap] = img[fill_gap]
            # Both have data → take brighter (higher alpha ≈ higher reflectivity)
            both = has_new & has_old
            prefer_new = both & (img[:, :, 3] > composite[:, :, 3])
            composite[prefer_new] = img[prefer_new]

    if composite is None:
        return None

    out_img = Image.fromarray(composite, "RGBA")
    buf = io.BytesIO()
    out_img.save(buf, format="PNG", optimize=False)
    return buf.getvalue()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("RADAR_SERVICE_PORT", 8765))
    uvicorn.run("radar_service:app", host="0.0.0.0", port=port, reload=False, workers=1)
