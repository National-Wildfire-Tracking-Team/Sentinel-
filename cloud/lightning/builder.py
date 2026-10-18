"""
builder.py
Keeps a rolling file of the last 15 minutes of GOES lightning flashes over
North America for Sentinel's Weather and All Hazards tabs. Runs every minute
(EventBridge → Lambda).

  s3://noaa-goes19, s3://noaa-goes18 (anonymous, us-east-1)
    ─▶ list the window's GLM-L2-LCFA files per satellite (source.py)
    ─▶ download each new file once ─▶ its good-quality flashes (glm.py)
    ─▶ keep those in the area and seen best from this satellite
    ─▶ s3://sentinel-lightning-<account>/lightning/v1/latest.json (gzipped)

Each GLM file is read once, by one function, however many people are
watching; browsers only ever fetch latest.json from the CDN.

Window. latest.json holds every flash from the last `window_seconds` (default
900). The window is anchored to the clock, not to the newest file, so if GLM
stops publishing, flashes age out rather than old lightning passing for
current.

Two satellites. GOES-East and GOES-West overlap over the western U.S. and both
report the same flashes there. Each flash is kept only from the satellite
whose sub-satellite longitude is nearest, so it's drawn once.

State. latest.json also lists, per satellite, the files already read that are
still in the window, so the next run reads only new ones (a failed download is
simply retried next minute). At most `max_files_per_satellite` new files are
read per run, newest first, so a cold start shows current lightning at once.

Failure isolation. Each satellite succeeds or fails on its own: one whose
listing fails keeps its flashes still inside the window and carries an `error`.

Format (schemaVersion 1). Flashes are column arrays of integers, oldest first:
  lon, lat   hundredths of a degree (GLM itself is ~8 km)
  t          seconds after `base` (epoch seconds) of the flash's first light
  e          flash energy, femtojoules (1e-15 J)
"""

from __future__ import annotations

import datetime as dt
import gzip
import json
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from glm import GlmError, read_flashes
from source import REGION, SATELLITES, SourceError, key_time
from store import LATEST_CACHE

SCHEMA_VERSION = 1
KEY_PREFIX = 'lightning/v1'
LATEST_KEY = f'{KEY_PREFIX}/latest.json'
FILE_SECONDS = 20
COORD_SCALE = 100
ENERGY_UNIT = 1e-15

ATTRIBUTION = ('Lightning: NOAA GOES-East/West Geostationary Lightning Mapper (GLM), via the NOAA Open Data '
               'Dissemination program on AWS. Processed by Sentinel; not endorsed by NOAA.')
NOTICE = ('Satellite-detected flashes, in-cloud and cloud-to-ground, located to about 8 km. '
          'Not every flash is detected, and flashes can lag by a minute or two.')


def in_area(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """North America, Hawaii, the Caribbean and the western Aleutians (across the antimeridian)."""
    return (lat >= 10) & (lat <= 80) & ((lon <= -50) | (lon >= 170))


def _lon_gap(a, b):
    return np.abs((np.asarray(a) - b + 180) % 360 - 180)


def nearest_to(sat: str, lon: np.ndarray, satellites=SATELLITES) -> np.ndarray:
    """Flashes this satellite sees best: its sub-satellite longitude is the nearest one."""
    own = _lon_gap(lon, satellites[sat]['subLon'])
    keep = np.ones(len(lon), dtype=bool)
    for other, cfg in satellites.items():
        if other != sat:
            keep &= own <= _lon_gap(lon, cfg['subLon'])
    return keep


def iso(epoch: float) -> str:
    return dt.datetime.fromtimestamp(epoch, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def decode_flashes(doc: dict | None) -> dict:
    """latest.json's flashes back to epoch seconds and degrees."""
    empty = {k: np.zeros(0) for k in ('lon', 'lat', 't', 'energy')}
    if not doc or doc.get('schemaVersion') != SCHEMA_VERSION:
        return empty
    f = doc.get('flashes') or {}
    try:
        return {
            'lon': np.asarray(f['lon'], dtype=np.float64) / COORD_SCALE,
            'lat': np.asarray(f['lat'], dtype=np.float64) / COORD_SCALE,
            't': doc['base'] + np.asarray(f['t'], dtype=np.float64),
            'energy': np.asarray(f['e'], dtype=np.float64) * ENERGY_UNIT,
        }
    except (KeyError, TypeError, ValueError):
        return empty


class LightningBuilder:
    def __init__(self, source, store, *, clock=time.time, satellites=SATELLITES, window_seconds=900,
                 max_files_per_satellite=30, workers=8, log=None):
        self.source = source
        self.store = store
        self.clock = clock
        self.satellites = satellites
        self.window = window_seconds
        self.max_files = max_files_per_satellite
        self.workers = workers
        self.log = log or (lambda *a, **k: None)

    def run(self) -> dict:
        now = self.clock()
        since = now - self.window
        now_dt = dt.datetime.fromtimestamp(now, dt.timezone.utc)
        since_dt = dt.datetime.fromtimestamp(since, dt.timezone.utc)
        prev = self.store.get_json(LATEST_KEY)
        prev_sources = (prev or {}).get('sources') or {}
        prev_read = (prev or {}).get('read') or {}

        kept = decode_flashes(prev)
        parts = [{k: v[kept['t'] >= since] for k, v in kept.items()}]
        sources, read = {}, {}
        files_read = source_bytes = source_errors = 0

        for sat, cfg in self.satellites.items():
            already = set(prev_read.get(sat) or [])
            info = {'label': cfg['label'], 'latest': (prev_sources.get(sat) or {}).get('latest')}
            try:
                listed = self.source.list_since(sat, since_dt - dt.timedelta(seconds=FILE_SECONDS), now_dt)
            except SourceError as exc:
                source_errors += 1
                info['error'] = str(exc)[:200]
                sources[sat] = info
                read[sat] = [k for k in already if self._start(k) >= since - FILE_SECONDS]
                self.log('WARNING', 'lightning_list_failed', satellite=sat, error=str(exc)[:200])
                continue

            in_window = {key for _, key in listed}
            new = [(t, key) for t, key in listed if key not in already][-self.max_files:]
            results = self._read_all(sat, [key for _, key in new])
            done = set(already & in_window)
            for key, outcome in results:
                if isinstance(outcome, Exception):
                    source_errors += 1
                    self.log('WARNING', 'lightning_file_failed', satellite=sat, key=key, error=str(outcome)[:200])
                    continue
                body_len, flashes = outcome
                files_read += 1
                source_bytes += body_len
                done.add(key)
                keep = in_area(flashes['lat'], flashes['lon']) & nearest_to(sat, flashes['lon'], self.satellites) \
                    & (flashes['t'] >= since) & (flashes['t'] <= now)
                parts.append({k: flashes[k][keep] for k in ('lon', 'lat', 't', 'energy')})

            if done:
                newest = max(self._start(k) for k in done) + FILE_SECONDS
                info['latest'] = iso(newest)
            info['files'] = len(done)
            sources[sat] = info
            read[sat] = sorted(done)

        merged = {k: np.concatenate([p[k] for p in parts]) for k in ('lon', 'lat', 't', 'energy')}
        order = np.argsort(merged['t'], kind='stable')
        merged = {k: v[order] for k, v in merged.items()}
        base = int(since)

        doc = {
            'schemaVersion': SCHEMA_VERSION,
            'generatedAt': iso(now),
            'windowSeconds': self.window,
            'base': base,
            'attribution': ATTRIBUTION,
            'notice': NOTICE,
            'sources': sources,
            'count': int(len(merged['t'])),
            'flashes': {
                'lon': np.round(merged['lon'] * COORD_SCALE).astype(int).tolist(),
                'lat': np.round(merged['lat'] * COORD_SCALE).astype(int).tolist(),
                't': np.round(merged['t'] - base).astype(int).tolist(),
                'e': np.round(merged['energy'] / ENERGY_UNIT).astype(int).tolist(),
            },
            'read': read,
            'source': {'buckets': [cfg['bucket'] for cfg in self.satellites.values()], 'region': REGION},
        }
        body = gzip.compress(json.dumps(doc, separators=(',', ':')).encode('utf-8'), mtime=0)
        self.store.put(LATEST_KEY, body, 'application/json', LATEST_CACHE, content_encoding='gzip')

        newest = [s['latest'] for s in sources.values() if s.get('latest')]
        oldest_latest = min(newest) if len(newest) == len(sources) else None
        latest_age = (now - dt.datetime.strptime(oldest_latest, '%Y-%m-%dT%H:%M:%SZ')
                      .replace(tzinfo=dt.timezone.utc).timestamp()) if oldest_latest else self.window
        return {
            'filesRead': files_read,
            'sourceBytes': source_bytes,
            'sourceErrors': source_errors,
            'flashes': doc['count'],
            'bytesWritten': len(body),
            'latestAgeSeconds': round(latest_age),
            'satellites': {sat: {k: v for k, v in s.items() if k != 'label'} for sat, s in sources.items()},
        }

    @staticmethod
    def _start(key: str) -> float:
        t = key_time(key)
        return t.timestamp() if t else 0.0

    def _read_one(self, sat: str, key: str):
        try:
            body = self.source.fetch(sat, key)
            return key, (len(body), read_flashes(body))
        except (SourceError, GlmError) as exc:
            return key, exc

    def _read_all(self, sat: str, keys: list[str]):
        if not keys:
            return []
        with ThreadPoolExecutor(max_workers=min(self.workers, len(keys))) as pool:
            return list(pool.map(lambda k: self._read_one(sat, k), keys))
