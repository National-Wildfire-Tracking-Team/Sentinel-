"""
builder.py
Turns new NOAA MRMS files into map-ready frames for Sentinel's Weather tab.
Runs every 2 minutes (EventBridge → Lambda), MRMS's own cadence.

  s3://noaa-mrms-pds (anonymous, us-east-1)
    ─▶ list only keys newer than the window start, per product (source.py)
    ─▶ download each new file once ─▶ decode GRIB2 / PNG packing (grib2.py)
    ─▶ max-pool to Web Mercator, lo and hi (grids.py) ─▶ 8-bit PNG (products.py, png.py)
    ─▶ s3://sentinel-mrms-frames-<account>/mrms/v1/… ─▶ manifest.json, written last

Each MRMS file is read once, by one function, however many people are
watching; browsers only ever fetch the small frames from the CDN.

Window. The manifest lists every frame from the last `window_minutes`
(default 60: ~30 frames per product for the animation). The window is anchored
to the clock, not to the newest file, so if MRMS stops publishing, frames age
out and the product reads `stale`, then `unavailable`, rather than old radar
passing for current. Frames that leave the window stay in S3 until the bucket's
1-day lifecycle rule deletes them.

Catch-up. At most `max_new_frames` per product per run, newest first, so a
cold start (or a gap) shows the current picture at once and backfills history
over the next few runs instead of risking the timeout.

Failure isolation. Each product succeeds or fails on its own: a product whose
listing or decode fails keeps its frames still inside the window and carries
an `error`, and the other products are unaffected.

Object keys (under KEY_PREFIX):
  {product}/{encodingId}/{lo|hi}/{frameId}.png   frameId = YYYYMMDD-HHMMSS (UTC observation time)
  manifest.json
`encodingId` changes when a product's encoding or the image grid changes, so
an immutable, CDN-cached frame is never reinterpreted with a new scale.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

import grids
from grib2 import decode
from png import encode_png
from products import PRODUCTS, encode_bytes
from source import BUCKET, REGION, SourceError
from store import IMMUTABLE, MANIFEST_CACHE

SCHEMA_VERSION = 1
KEY_PREFIX = 'mrms/v1'
MANIFEST_KEY = f'{KEY_PREFIX}/manifest.json'
CADENCE_SECONDS = 120

ATTRIBUTION = ('MRMS: NOAA National Severe Storms Laboratory and NWS NCEP, via the NOAA Open Data '
               'Dissemination program on AWS. Processed by Sentinel; not endorsed by NOAA.')
NOTICE = ('Radar-derived observations, quality-controlled automatically. Frames are 8-bit, '
          'downsampled for display, and may lag MRMS by a few minutes.')


def frame_id(t: dt.datetime) -> str:
    return t.strftime('%Y%m%d-%H%M%S')


def iso(t: dt.datetime) -> str:
    return t.strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_iso(s: str) -> dt.datetime:
    return dt.datetime.strptime(s, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)


class MrmsBuilder:
    def __init__(self, source, store, *, clock=time.time, products=None, window_minutes=60, max_new_frames=4,
                 stale_after_minutes=15, lo_width=2048, hi_width=4096, workers=4, log=None):
        self.source = source
        self.store = store
        self.clock = clock
        self.products = products or PRODUCTS
        self.window = dt.timedelta(minutes=window_minutes)
        self.max_new_frames = max_new_frames
        self.stale_after = dt.timedelta(minutes=stale_after_minutes)
        self.workers = workers
        self.log = log or (lambda *a, **k: None)
        self.levels = {'lo': grids.conus_grid(lo_width), 'hi': grids.conus_grid(hi_width)}
        self.stats = {'framesWritten': 0, 'bytesWritten': 0, 'sourceBytes': 0, 'productErrors': 0}
        self._lock = threading.Lock()

    def _count(self, **inc):
        with self._lock:
            for k, v in inc.items():
                self.stats[k] += v

    def encoding_id(self, product) -> str:
        spec = {'encoding': product.to_manifest()['encoding'], 'noCoverageBelow': product.no_coverage_below,
                'levels': {r: [g.width, g.height] for r, g in self.levels.items()}, 'bounds': grids.CONUS_BOUNDS}
        return 'e' + hashlib.sha1(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:8]

    # ── one frame ──

    def _build_frame(self, product, enc_id: str, key: str, when: dt.datetime) -> None:
        data = self.source.fetch(key)
        self._count(sourceBytes=len(data))
        field = decode(data)
        west, south, east, north = field.grid.bounds
        if max(abs(a - b) for a, b in zip((west, south, east, north), grids.CONUS_BOUNDS)) > 0.02:
            raise ValueError(f'{product.source} grid changed: bounds {field.grid.bounds}')
        for res, grid in self.levels.items():
            pooled, inside = grids.max_pool(field.packed, field.grid, grid)
            values = field.to_physical(pooled)
            values[(values < product.no_coverage_below) | ~inside] = np.nan
            body = encode_png(encode_bytes(values, product.lo, product.hi, product.transform))
            self.store.put(f'{KEY_PREFIX}/{product.id}/{enc_id}/{res}/{frame_id(when)}.png', body, 'image/png', IMMUTABLE)
            self._count(framesWritten=1, bytesWritten=len(body))

    # ── one product ──

    def _product(self, product, previous: dict, now: dt.datetime) -> dict:
        enc_id = self.encoding_id(product)
        since = now - self.window
        kept = []
        if previous.get('encodingId') == enc_id:
            kept = [f for f in previous.get('frames', []) if since < parse_iso(f['time']) <= now]
        have = {f['id'] for f in kept}
        error = None
        built = []
        try:
            listing = self.source.list_since(product.prefix, product.source, since, now)
        except SourceError as exc:
            listing, error = [], {'code': 'source_unavailable', 'message': str(exc)[:200]}
            self.log('WARNING', 'mrms_list_failed', product=product.id, detail=str(exc)[:300])
        missing = [(t, k) for t, k in listing if frame_id(t) not in have]
        for when, key in reversed(missing[-self.max_new_frames:]):  # newest first
            try:
                self._build_frame(product, enc_id, key, when)
                built.append({'id': frame_id(when), 'time': iso(when)})
            except Exception as exc:  # one bad file never blocks the rest
                error = {'code': 'frame_failed', 'message': f'{type(exc).__name__}: {str(exc)[:160]}'}
                self.log('WARNING', 'mrms_frame_failed', product=product.id, key=key,
                         error=type(exc).__name__, detail=str(exc)[:300])
        if error:
            self._count(productErrors=1)
        frames = sorted(kept + built, key=lambda f: f['time'])
        latest = frames[-1]['time'] if frames else None
        if not frames:
            status = 'unavailable'
        elif now - parse_iso(latest) > self.stale_after:
            status = 'stale'
        else:
            status = 'ok'
        return {
            **product.to_manifest(), 'encodingId': enc_id, 'status': status, 'error': error,
            'latest': latest, 'frames': frames, 'built': len(built), 'pending': len(missing) - len(built),
        }

    # ── main ──

    def run(self) -> dict:
        started = time.monotonic()
        now = dt.datetime.fromtimestamp(int(self.clock()), tz=dt.timezone.utc)
        previous = (self.store.get_json(MANIFEST_KEY) or {}).get('products', {})
        with ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix='mrms') as pool:
            futures = {pid: pool.submit(self._product, p, previous.get(pid, {}), now) for pid, p in self.products.items()}
            products = {pid: f.result() for pid, f in futures.items()}

        manifest = self._manifest(products, now)
        self.store.put(MANIFEST_KEY, json.dumps(manifest, separators=(',', ':')).encode(), 'application/json', MANIFEST_CACHE)

        ages = [(now - parse_iso(p['latest'])).total_seconds() for p in products.values() if p['latest']]
        summary = {
            'seconds': round(time.monotonic() - started, 1), **self.stats,
            'latestAgeSeconds': max(ages) if ages else None,
            'products': {pid: {'status': p['status'], 'frames': len(p['frames']), 'built': p['built'], 'pending': p['pending']}
                         for pid, p in products.items()},
        }
        return summary

    def _manifest(self, products: dict, now: dt.datetime) -> dict:
        lo, hi = self.levels['lo'], self.levels['hi']
        return {
            'schemaVersion': SCHEMA_VERSION,
            'kind': 'mrms-manifest',
            'generatedAt': iso(now),
            'notice': NOTICE,
            'attribution': ATTRIBUTION,
            'source': {
                'name': 'NOAA Multi-Radar/Multi-Sensor System (MRMS)',
                'uri': f's3://{BUCKET}/CONUS/', 'region': REGION,
                'registry': 'https://registry.opendata.aws/noaa-mrms-pds/',
            },
            'domain': 'CONUS',
            'windowMinutes': int(self.window.total_seconds() // 60),
            'cadenceSeconds': CADENCE_SECONDS,
            'staleAfterSeconds': int(self.stale_after.total_seconds()),
            'image': {'coordinates': lo.coordinates, 'bounds': lo.bounds,
                      'levels': {'lo': [lo.width, lo.height], 'hi': [hi.width, hi.height]}},
            'keys': {'frame': '{product}/{encodingId}/{res}/{frameId}.png',
                     'frameIdFormat': 'YYYYMMDD-HHMMSS, UTC observation time'},
            'products': {pid: {k: v for k, v in p.items() if k not in ('built', 'pending')} for pid, p in products.items()},
        }
