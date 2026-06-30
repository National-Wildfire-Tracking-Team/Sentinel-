"""
nexrad_processor.py
Converts raw NEXRAD Level II data into XYZ map tiles.

Workflow per tile request:
  1. Load latest scan bytes for a station (from NEXRADFetcher).
  2. Parse the sweep with Py-ART.
  3. Project gate positions from polar → EPSG:3857 (Web Mercator).
  4. Build a scipy KDTree for fast nearest-neighbor rasterization.
  5. For each (z, x, y) tile: clip gates to the tile bbox, rasterize
     onto a 256×256 grid, apply color table, return PNG bytes.

The KDTree and projected arrays are cached per (site_id, scan_key) so
re-processing only happens when a new scan arrives.
"""

import asyncio
import io
import logging
import math
import tempfile
import os
from typing import Optional

import numpy as np
from PIL import Image
from pyproj import Transformer

from color_tables import COLORIZE

log = logging.getLogger(__name__)

# EPSG:4326 → EPSG:3857 transformer (always_xy=True: (lon, lat) → (x, y))
_TO_MERC = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)

# Maximum distance (meters) from a gate center for a pixel to be colored.
# ~4 km covers typical gate spacing (250 m) × beam-width expansion at range.
_MAX_GATE_DIST_M = 4_000

# Tile pixel dimension
_TILE_PX = 256

# Available products (Level II sweep field names)
PRODUCTS = {
    "reflectivity": "reflectivity",          # base reflectivity (DBZ)
    "velocity":     "velocity",              # radial velocity (m/s)
}


def _tile_to_merc_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Return (x_min, y_min, x_max, y_max) in EPSG:3857 meters."""
    n = 2 ** z
    lon_w = x / n * 360.0 - 180.0
    lon_e = (x + 1) / n * 360.0 - 180.0
    lat_n = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_s = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    x_min, y_min = _TO_MERC.transform(lon_w, lat_s)
    x_max, y_max = _TO_MERC.transform(lon_e, lat_n)
    return x_min, y_min, x_max, y_max


class ScanCache:
    """Holds the projected gate arrays for one scan."""

    def __init__(self, site_id: str, scan_key: str, merc_x: np.ndarray,
                 merc_y: np.ndarray, fields: dict[str, np.ndarray]):
        self.site_id = site_id
        self.scan_key = scan_key
        self.merc_x = merc_x     # shape (N,) Web Mercator X (meters)
        self.merc_y = merc_y     # shape (N,) Web Mercator Y (meters)
        self.fields = fields      # product → flat np.ndarray shape (N,)
        self._tree = None

    @property
    def tree(self):
        if self._tree is None:
            from scipy.spatial import KDTree
            pts = np.column_stack([self.merc_x, self.merc_y])
            self._tree = KDTree(pts)
        return self._tree


class NEXRADProcessor:
    """Generates PNG tiles from NEXRAD Level II data."""

    def __init__(self):
        # site_id → ScanCache
        self._scan_cache: dict[str, ScanCache] = {}

    # ── Public API ────────────────────────────────────────────────────────────

    async def update_scan(self, site_id: str, scan_key: str, raw_bytes: bytes) -> bool:
        """
        Parse raw_bytes (NEXRAD Level II archive file) and update internal cache.
        Returns True if successfully processed.
        """
        existing = self._scan_cache.get(site_id)
        if existing and existing.scan_key == scan_key:
            return True  # already cached

        try:
            cache = await asyncio.to_thread(
                self._process_scan, site_id, scan_key, raw_bytes
            )
            self._scan_cache[site_id] = cache
            return True
        except Exception as exc:
            log.warning("Failed to process scan for %s: %s", site_id, exc)
            return False

    def generate_tile(self, site_id: str, product: str, z: int, x: int, y: int) -> Optional[bytes]:
        """
        Render a 256×256 PNG tile for the given site and product.
        Returns None when there is no data covering the tile.
        """
        cache = self._scan_cache.get(site_id)
        if cache is None:
            return None

        field_key = PRODUCTS.get(product)
        if field_key is None or field_key not in cache.fields:
            return None

        try:
            return self._rasterize_tile(cache, field_key, z, x, y)
        except Exception as exc:
            log.debug("Tile render error for %s/%s/%d/%d/%d: %s", site_id, product, z, x, y, exc)
            return None

    def get_cached_stations(self) -> list[str]:
        return list(self._scan_cache.keys())

    # ── Internal ──────────────────────────────────────────────────────────────

    def _process_scan(self, site_id: str, scan_key: str, raw_bytes: bytes) -> ScanCache:
        """CPU-bound: parse Level II file → projected arrays. Runs in thread pool."""
        import pyart

        # Py-ART needs a file path; write to a temp file
        suffix = ".ar2v" if not scan_key.endswith(".gz") else ".ar2v.gz"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name

        try:
            radar = pyart.io.read_nexrad_archive(tmp_path)
        finally:
            os.unlink(tmp_path)

        # Use the lowest elevation sweep (sweep index 0)
        sweep_idx = 0

        fields: dict[str, np.ndarray] = {}

        for product, field_name in PRODUCTS.items():
            if field_name not in radar.fields:
                continue
            data = radar.get_field(sweep_idx, field_name)
            # Replace masked/invalid values with NaN
            if hasattr(data, "filled"):
                arr = data.filled(np.nan).astype(np.float32)
            else:
                arr = np.where(np.ma.getmaskarray(data), np.nan, data).astype(np.float32)
            fields[product] = arr.flatten()

        if not fields:
            raise ValueError("No recognized fields found in scan")

        # Gate lat/lon for the lowest sweep
        gate_lat = radar.gate_latitude["data"][radar.get_slice(sweep_idx)].flatten()
        gate_lon = radar.gate_longitude["data"][radar.get_slice(sweep_idx)].flatten()

        # Project to Web Mercator
        merc_x, merc_y = _TO_MERC.transform(gate_lon, gate_lat)
        merc_x = merc_x.astype(np.float32)
        merc_y = merc_y.astype(np.float32)

        # Drop gates with NaN coordinates
        valid_pos = np.isfinite(merc_x) & np.isfinite(merc_y)
        merc_x = merc_x[valid_pos]
        merc_y = merc_y[valid_pos]
        fields = {k: v[valid_pos] for k, v in fields.items()}

        log.info("Processed %s — %d gates, products: %s", site_id, len(merc_x), list(fields))
        return ScanCache(site_id, scan_key, merc_x, merc_y, fields)

    def _rasterize_tile(self, cache: ScanCache, product: str, z: int, x: int, y: int) -> Optional[bytes]:
        x_min, y_min, x_max, y_max = _tile_to_merc_bounds(z, x, y)

        # Filter gates to tile bbox + margin
        tile_w = x_max - x_min
        tile_h = y_max - y_min
        margin = max(tile_w, tile_h) * 0.15 + _MAX_GATE_DIST_M

        mask = (
            (cache.merc_x >= x_min - margin) & (cache.merc_x <= x_max + margin) &
            (cache.merc_y >= y_min - margin) & (cache.merc_y <= y_max + margin)
        )

        if not mask.any():
            return None  # tile outside radar coverage

        local_x = cache.merc_x[mask]
        local_y = cache.merc_y[mask]
        local_z = cache.fields[product][mask]

        # Drop NaN-valued gates
        valid = np.isfinite(local_z)
        if not valid.any():
            return None

        local_x = local_x[valid]
        local_y = local_y[valid]
        local_z = local_z[valid]

        # Build local KDTree for the filtered subset
        from scipy.spatial import KDTree
        pts = np.column_stack([local_x, local_y])
        tree = KDTree(pts)

        # Create pixel grid in Web Mercator space
        px_coords = np.linspace(x_min, x_max, _TILE_PX, dtype=np.float32)
        py_coords = np.linspace(y_max, y_min, _TILE_PX, dtype=np.float32)  # Y axis flipped
        XX, YY = np.meshgrid(px_coords, py_coords)
        query_pts = np.column_stack([XX.flatten(), YY.flatten()])

        # Nearest-neighbor lookup
        dists, indices = tree.query(query_pts, k=1, workers=1)

        grid = np.full(_TILE_PX * _TILE_PX, np.nan, dtype=np.float32)
        within = dists < _MAX_GATE_DIST_M
        grid[within] = local_z[indices[within]]
        grid = grid.reshape(_TILE_PX, _TILE_PX)

        if not np.isfinite(grid).any():
            return None

        # Colorize
        colorize_fn = COLORIZE.get(product)
        if colorize_fn is None:
            return None

        rgba = colorize_fn(grid)

        img = Image.fromarray(rgba, "RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=False)
        return buf.getvalue()
