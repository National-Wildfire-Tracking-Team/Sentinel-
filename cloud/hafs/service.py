"""
service.py
The HAFS model-output service: run discovery, run detail and on-demand
frames. Transport-free (lambda_handler.py and local.py put HTTP around it),
so tests drive it with a fake source.

  NOAA HAFS bucket ─ listings ─▶ catalog()                 which runs exist (model → cycle → storm → domain → hours)
                   ─ .idx + file heads ─▶ run_detail()     per-hour frame corners and field availability
                   ─ .idx + byte ranges ─▶ frame()         decode → calculate → Web Mercator → 8-bit PNG

Rendering on demand, not pre-rendering every run: one storm-run is ~48 GB of
GRIB2 and ~1,300 possible frames, most of which nobody opens. A frame costs
~0.5-2 MB of in-region reads and well under a second to make, and is then
cached by CloudFront (with Origin Shield) as immutable, because a NOAA file
never changes once it is written. See README.md "Cost".

Nothing is invented. Runs, storms, domains and hours come from the bucket
listing (a GRIB2 file and its .idx must both exist); fields from that hour's
.idx; a field missing from an hour is reported unavailable, never filled in.
"""

from __future__ import annotations

import datetime as dt
import re
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from fields import FIELDS
from grib2 import decode, read_grid
from idx import parse_idx
from models import LIVE_MODELS, MODELS
from render import frame_for, render
from source import CYCLE_RE, STORM_RE, NotFound, SourceError

SCHEMA_VERSION = 1
HEAD_BYTES = 512
CATALOG_DAYS = 3
IN_PROGRESS_MINUTES = 90

ATTRIBUTION = ('HAFS: NOAA NWS NCEP Environmental Modeling Center, via the NOAA Open Data Dissemination program '
               '(s3://noaa-nws-hafs-pds) and NOMADS. Processed by Sentinel; not endorsed by NOAA.')
NOTICE = ('Numerical model forecast output. Every frame is one HAFS run at one forecast hour; it is not '
          'observed data, and model reflectivity is not radar.')

BASINS = {'l': 'AL', 'e': 'EP', 'c': 'CP', 'w': 'WP', 'a': 'IO', 'b': 'IO', 's': 'SH', 'p': 'SH', 'q': 'SL'}


class RequestError(Exception):
    """A request the service refuses or can't answer: carries an HTTP status and a public message."""

    def __init__(self, status: int, message: str, code: str):
        super().__init__(message)
        self.status = status
        self.code = code


def iso(t: dt.datetime) -> str:
    return t.strftime('%Y-%m-%dT%H:%M:%SZ')


def cycle_time(cycle: str) -> dt.datetime:
    return dt.datetime.strptime(cycle, '%Y%m%d%H').replace(tzinfo=dt.timezone.utc)


def storm_atcf_id(storm: str, cycle: str) -> str | None:
    """'09l' + 2026… → 'AL092026' (the id NHC and the spaghetti tracks use)."""
    basin = BASINS.get(storm[-1])
    return f'{basin}{storm[:2]}{cycle[:4]}' if basin else None


class LRU:
    def __init__(self, size: int):
        self.size = size
        self.data: OrderedDict = OrderedDict()
        self.lock = threading.Lock()

    def get(self, key):
        with self.lock:
            if key in self.data:
                self.data.move_to_end(key)
                return self.data[key]
        return None

    def put(self, key, value):
        with self.lock:
            self.data[key] = value
            self.data.move_to_end(key)
            while len(self.data) > self.size:
                self.data.popitem(last=False)
        return value


def _parse_iso(s: str) -> dt.datetime | None:
    try:
        return dt.datetime.strptime(s[:19], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=dt.timezone.utc)
    except (ValueError, TypeError):
        return None


class HafsService:
    def __init__(self, source, *, clock=time.time, log=None, workers=16, catalog_days=CATALOG_DAYS, catalog_ttl=60):
        self.source = source
        self.clock = clock
        self.log = log or (lambda *a, **k: None)
        self.workers = workers
        self.catalog_days = catalog_days
        self.catalog_ttl = catalog_ttl
        # Finished runs never change, so their listings, inventories and heads are kept.
        self.runs = LRU(64)  # (prefix, cycle) → (listing, fetched_at)
        self.idx = LRU(512)  # (prefix, cycle, storm, domain, hour) → entries
        self.heads = LRU(1024)  # same key → LatLonGrid
        self.names = LRU(256)  # (prefix, cycle, storm) → name | None
        self.catalog_cache = None
        self.stats = {'frames': 0, 'frameMs': 0, 'decodeMs': 0}

    def _now(self) -> dt.datetime:
        return dt.datetime.fromtimestamp(self.clock(), tz=dt.timezone.utc)

    def _pool(self):
        return ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix='hafs')

    # ── validation ──

    @staticmethod
    def model(model_id: str):
        m = MODELS.get(model_id)
        if not m:
            raise RequestError(404, f'Unknown model {model_id[:16]!r}.', 'unknown_model')
        if not m.prefix:
            raise RequestError(404, f'{m.name} is retired (superseded by HAFS in 2023); no gridded runs are available.',
                               'model_retired')
        return m

    @staticmethod
    def check_run(cycle: str, storm: str):
        if not CYCLE_RE.match(cycle or '') or not STORM_RE.match(storm or ''):
            raise RequestError(400, 'Invalid cycle or storm.', 'bad_request')
        try:
            cycle_time(cycle)
        except ValueError:
            raise RequestError(400, 'Invalid cycle.', 'bad_request') from None
        if cycle[8:] not in ('00', '06', '12', '18'):
            raise RequestError(400, 'HAFS cycles are 00, 06, 12 and 18 UTC.', 'bad_request')

    # ── listings ──

    def _listing(self, prefix: str, cycle: str):
        """A cycle's files. Re-listed at most once a minute while the run may still be arriving."""
        hit = self.runs.get((prefix, cycle))
        now = self.clock()
        if hit:
            files, fetched_at, settled = hit
            if settled or now - fetched_at < 60:
                return files
        files = self.source.list_run(prefix, cycle)
        newest = max((_parse_iso(f.last_modified) for f in files if f.last_modified), default=None)
        settled = bool(files) and newest is not None and (self._now() - newest).total_seconds() > 6 * 3600
        self.runs.put((prefix, cycle), (files, now, settled))
        return files

    def _storm_name(self, prefix: str, cycle: str, storm: str) -> str | None:
        key = (prefix, cycle, storm)
        cached = self.names.get(key)
        if cached is not None:
            return cached or None
        try:
            text = self.source.fetch_storm_info(prefix, cycle, storm).strip().lower()
        except SourceError:
            return None  # not cached: try again next time
        m = re.fullmatch(r'([a-z][a-z-]{1,30})' + re.escape(storm), text)
        name = m.group(1).upper() if m else ''
        self.names.put(key, name)
        return name or None

    def _storm_runs(self, model, cycle: str, files) -> list[dict]:
        by_storm: dict[str, dict] = {}
        for f in files:
            if not f.has_idx:
                continue
            s = by_storm.setdefault(f.storm, {})
            s.setdefault(f.domain, []).append(f)
        now = self._now()
        out = []
        for storm, domains in sorted(by_storm.items()):
            ddesc = {}
            newest = None
            for d in model.domains:
                fs = sorted(domains.get(d.id, []), key=lambda f: f.hour)
                if not fs:
                    continue
                hours = [f.hour for f in fs]
                mod = max((_parse_iso(f.last_modified) for f in fs), default=None)
                newest = max(filter(None, [newest, mod]), default=None)
                ddesc[d.id] = {'hours': hours, 'latestHour': hours[-1], 'files': len(hours)}
            if not ddesc:
                continue
            latest = max(v['latestHour'] for v in ddesc.values())
            expected = model.forecast_hours
            complete = expected is not None and all(
                v['latestHour'] >= expected and v['hours'] == list(range(0, expected + 1, 3)) for v in ddesc.values())
            if complete:
                status = 'complete'
            elif newest and (now - newest).total_seconds() < IN_PROGRESS_MINUTES * 60:
                status = 'in-progress'
            else:
                status = 'incomplete'
            out.append({
                'id': storm, 'atcfId': storm_atcf_id(storm, cycle), 'basin': BASINS.get(storm[-1]),
                'status': status, 'latestHour': latest, 'updatedAt': iso(newest) if newest else None,
                'domains': ddesc,
            })
        return out

    # ── catalog ──

    def catalog(self) -> dict:
        cached = self.catalog_cache
        if cached and self.clock() - cached[1] < self.catalog_ttl:
            return cached[0]
        today = self._now().date()
        days = [(today - dt.timedelta(days=i)).strftime('%Y%m%d') for i in range(self.catalog_days)]
        errors = []
        with self._pool() as pool:
            cyc_jobs = {(m.id, day): pool.submit(self.source.list_cycles, m.prefix, day) for m in LIVE_MODELS for day in days}
            cycles = {}
            for (mid, day), fut in cyc_jobs.items():
                try:
                    cycles.setdefault(mid, []).extend(fut.result())
                except SourceError as exc:
                    errors.append({'model': mid, 'day': day, 'error': str(exc)[:160]})
            run_jobs = {(mid, c): pool.submit(self._listing, MODELS[mid].prefix, c)
                        for mid, cs in cycles.items() for c in cs}
            listings = {}
            for key, fut in run_jobs.items():
                try:
                    listings[key] = fut.result()
                except SourceError as exc:
                    errors.append({'model': key[0], 'cycle': key[1], 'error': str(exc)[:160]})
            runs = {key: self._storm_runs(MODELS[key[0]], key[1], files) for key, files in listings.items()}
            name_jobs = {(mid, c, s['id']): pool.submit(self._storm_name, MODELS[mid].prefix, c, s['id'])
                         for (mid, c), storms in runs.items() for s in storms}
            for (mid, c, sid), fut in name_jobs.items():
                name = fut.result()
                for s in runs[(mid, c)]:
                    if s['id'] == sid:
                        s['name'] = name

        models = []
        for m in MODELS.values():
            entry = {'id': m.id, 'name': m.name, 'atcf': m.atcf, 'status': m.status, 'description': m.description,
                     'domains': [{'id': d.id, 'label': d.label, 'description': d.description} for d in m.domains],
                     'forecastHours': m.forecast_hours, 'cycleHours': m.cycle_hours, 'runs': []}
            for c in sorted(cycles.get(m.id, []), reverse=True):
                storms = runs.get((m.id, c), [])
                if storms:
                    entry['runs'].append({'cycle': c, 'initTime': iso(cycle_time(c)), 'storms': storms})
            models.append(entry)

        body = {
            'schemaVersion': SCHEMA_VERSION, 'kind': 'hafs-catalog', 'generatedAt': iso(self._now()),
            'notice': NOTICE, 'attribution': ATTRIBUTION,
            'source': {'name': 'NOAA Hurricane Analysis and Forecast System (HAFS)', 'uri': 's3://noaa-nws-hafs-pds/',
                       'registry': 'https://registry.opendata.aws/noaa-nws-hafs/', 'fallback': 'https://nomads.ncep.noaa.gov/'},
            'days': self.catalog_days,
            'fields': [f.to_api() for f in FIELDS.values()],
            'models': models,
            'errors': errors,
        }
        self.log('INFO', 'hafs_catalog', runs=sum(len(m['runs']) for m in models), errors=len(errors))
        self.catalog_cache = (body, self.clock())
        return body

    # ── one run ──

    def _idx(self, prefix, cycle, storm, domain, hour, size=None):
        key = (prefix, cycle, storm, domain, hour)
        hit = self.idx.get(key)
        if hit is not None:
            return hit
        if size is None:  # the last message's end comes from the file size, so take it from the listing
            size = next((f.size for f in self._listing(prefix, cycle)
                         if (f.storm, f.domain, f.hour) == (storm, domain, hour)), None)
        try:
            text = self.source.fetch_idx(prefix, cycle, storm, domain, hour)
        except NotFound:
            raise RequestError(404, f'No {domain} file for +{hour} h in this run.', 'hour_unavailable') from None
        return self.idx.put(key, parse_idx(text, size))

    def _head(self, prefix, cycle, storm, domain, hour):
        key = (prefix, cycle, storm, domain, hour)
        hit = self.heads.get(key)
        if hit is not None:
            return hit
        head = self.source.fetch_range(prefix, cycle, storm, domain, hour, 0, HEAD_BYTES - 1)
        return self.heads.put(key, read_grid(head))

    def _run_files(self, model, cycle, storm):
        files = [f for f in self._listing(model.prefix, cycle) if f.storm == storm and f.has_idx]
        if not files:
            raise RequestError(404, f'No {model.name} run for storm {storm} at {cycle[8:]}Z {cycle[:8]}.', 'run_not_found')
        return files

    def run_detail(self, model_id: str, cycle: str, storm: str) -> dict:
        model = self.model(model_id)
        self.check_run(cycle, storm)
        files = self._run_files(model, cycle, storm)
        storm_desc = next(s for s in self._storm_runs(model, cycle, files) if s['id'] == storm)
        init = cycle_time(cycle)

        jobs = {}
        with self._pool() as pool:
            for f in files:
                jobs[(f.domain, f.hour)] = (
                    pool.submit(self._idx, model.prefix, cycle, storm, f.domain, f.hour, f.size),
                    pool.submit(self._head, model.prefix, cycle, storm, f.domain, f.hour),
                )
        domains = {}
        for d in model.domains:
            hours = storm_desc['domains'].get(d.id, {}).get('hours', [])
            if not hours:
                continue
            frames, availability, problems = {}, {fid: [] for fid in FIELDS}, []
            for h in hours:
                idx_f, head_f = jobs[(d.id, h)]
                try:
                    entries, grid = idx_f.result(), head_f.result()
                except Exception as exc:  # one bad hour never hides the rest of the run
                    problems.append({'hour': h, 'error': f'{type(exc).__name__}: {str(exc)[:120]}'})
                    continue
                frames[str(h)] = {**frame_for(grid).to_api(), 'validTime': iso(init + dt.timedelta(hours=h))}
                for fid, fdef in FIELDS.items():
                    if fdef.select(entries, h):
                        availability[fid].append(h)
            domains[d.id] = {
                'id': d.id, 'label': d.label, 'description': d.description,
                'hours': [int(h) for h in frames], 'latestHour': max((int(h) for h in frames), default=None),
                'frames': frames, 'fields': {fid: hs for fid, hs in availability.items() if hs}, 'problems': problems,
            }
        self.log('INFO', 'hafs_run_detail', model=model.id, cycle=cycle, storm=storm,
                 hours={k: len(v['hours']) for k, v in domains.items()})
        return {
            'schemaVersion': SCHEMA_VERSION, 'kind': 'hafs-run', 'generatedAt': iso(self._now()),
            'notice': NOTICE, 'attribution': ATTRIBUTION,
            'model': {'id': model.id, 'name': model.name, 'atcf': model.atcf, 'status': model.status},
            'cycle': cycle, 'initTime': iso(init),
            'storm': {k: storm_desc.get(k) for k in ('id', 'atcfId', 'basin', 'name', 'status', 'latestHour', 'updatedAt')}
            | {'name': self._storm_name(model.prefix, cycle, storm)},
            'domains': domains,
        }

    def run_is_settled(self, model_id: str, cycle: str, storm: str) -> bool:
        hit = self.runs.get((MODELS[model_id].prefix, cycle))
        return bool(hit and hit[2])

    # ── one frame ──

    def frame(self, model_id: str, cycle: str, storm: str, domain: str, field_id: str, hour: int) -> tuple[bytes, dict]:
        started = time.monotonic()
        model = self.model(model_id)
        self.check_run(cycle, storm)
        if domain not in {d.id for d in model.domains}:
            raise RequestError(404, f'Unknown domain {domain[:16]!r}.', 'unknown_domain')
        field = FIELDS.get(field_id)
        if not field:
            raise RequestError(404, f'Unknown field {field_id[:32]!r}.', 'unknown_field')
        if not 0 <= hour <= 384:
            raise RequestError(400, 'Invalid forecast hour.', 'bad_request')

        entries = self._idx(model.prefix, cycle, storm, domain, hour)
        picked = field.select(entries, hour)
        if not picked:
            raise RequestError(404, f'{field.label} is not in this run at +{hour} h.', 'field_unavailable')
        try:
            with self._pool() as pool:
                blobs = list(pool.map(lambda e: self.source.fetch_range(
                    model.prefix, cycle, storm, domain, hour, e.start, e.end if e.end is not None else e.start + (16 << 20) - 1), picked))
        except NotFound:
            raise RequestError(404, f'No {domain} file for +{hour} h in this run.', 'hour_unavailable') from None
        t_decode = time.monotonic()
        decoded = [decode(b) for b in blobs]
        grid = decoded[0].grid
        if any(d.grid != grid for d in decoded[1:]):
            raise RequestError(500, 'Source fields are on different grids.', 'grid_mismatch')
        with np.errstate(invalid='ignore', over='ignore'):
            values = field.compute([d.values for d in decoded]).astype(np.float32)
        decode_ms = (time.monotonic() - t_decode) * 1000
        png, frame = render(field, values, grid)
        init = cycle_time(cycle)
        meta = {
            'model': model.id, 'cycle': cycle, 'storm': storm, 'domain': domain, 'field': field.id, 'hour': hour,
            'validTime': iso(init + dt.timedelta(hours=hour)), **frame.to_api(),
            'sourceMessages': [{'var': e.var, 'level': e.level, 'time': e.time, 'bytes': e.size} for e in picked],
        }
        ms = (time.monotonic() - started) * 1000
        self.stats['frames'] += 1
        self.stats['frameMs'] += ms
        self.stats['decodeMs'] += decode_ms
        self.log('INFO', 'hafs_frame', model=model.id, cycle=cycle, storm=storm, domain=domain, field=field.id, hour=hour,
                 sourceBytes=sum(len(b) for b in blobs), pngBytes=len(png), ms=round(ms), decodeMs=round(decode_ms))
        return png, meta
