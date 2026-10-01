"""
fields/builder.py
Builds the map-ready model fields Sentinel's Models tab renders. Runs every
15 minutes (EventBridge → Lambda) and does work only when a model has a new
complete run.

  HRRR / GFS Icechunk ─▶ one read per variable (all lead times at once) ─▶ derive (SI)
    ─▶ resample to Web Mercator (precomputed bilinear LUT) ─▶ 8-bit PNG per forecast hour ─▶ S3
    ─▶ HRRR − GFS difference frames at shared valid times ─▶ manifest.json (written last)

Why per run and not per request: each dataset chunk holds every lead time,
so one forecast hour costs as much to read as all of them (HRRR: ~63 MB per
variable for the whole CONUS run). Building a run once and serving static,
immutable images makes every request a CDN hit.

Run choice: a model's current run is its newest *complete* run (the
completeness variable has data at every planned lead time at the domain
centre). Until a newer run completes, the previous one stays current. If no
recent run is complete, the newest run with any data is used and flagged
`complete: false`.

Object keys (under KEY_PREFIX):
  {model}/{runId}/{variable}/{res}/{hour:03d}.png    8-bit field frame; res = lo | hi
      lo: HRRR 900 px, GFS 520 px (its native 0.25°) — default, and what animation uses
      hi: HRRR 1800 px (~its native 3 km) — loaded when paused and zoomed in
  {model}/{runId}/wind/{hour:03d}.png          RGBA wind vectors (R=u, G=v) for particles
  diff/{hrrrRunId}_{gfsRunId}/{variable}/{validId}.png   HRRR − GFS
  manifest.json
"""

from __future__ import annotations

import datetime as dt
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from fields import grids
from fields.png import encode_png
from fields.store import IMMUTABLE, MANIFEST_CACHE
from fields.variables import FIELD_VARIABLES, WIND_VECTOR_RANGE, derive, encode_bytes
from providers import NoDataError

SCHEMA_VERSION = 1
KEY_PREFIX = 'weather-models/fields/v1'
MANIFEST_KEY = f'{KEY_PREFIX}/manifest.json'
RUN_CANDIDATES = 3


def run_id(epoch: int) -> str:
    return dt.datetime.fromtimestamp(epoch, tz=dt.timezone.utc).strftime('%Y%m%dT%HZ')


def valid_id(epoch: int) -> str:
    return dt.datetime.fromtimestamp(epoch, tz=dt.timezone.utc).strftime('%Y%m%dT%H%MZ')


def iso(epoch: int) -> str:
    return dt.datetime.fromtimestamp(epoch, tz=dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


class ModelPlan:
    """The run to publish for one model, and whether it needs building."""

    def __init__(self, provider, run_index, pos, available, expected):
        self.provider = provider
        self.run_index = run_index
        self.pos = pos
        self.run_time = int(run_index.init_times[pos])
        self.id = run_id(self.run_time)
        self.leads = run_index.lead_seconds[:available]
        self.complete = available >= expected
        self.needs_build = True

    @property
    def hours(self) -> list[int]:
        return [int(round(s / 3600)) for s in self.leads]

    @property
    def valid_times(self) -> list[int]:
        return [self.run_time + int(s) for s in self.leads]


class FieldBuilder:
    def __init__(self, providers: dict, store, *, clock=time.time, hrrr_width=1800, gfs_width=520, workers=4, log=None):
        self.providers = providers
        self.store = store
        self.clock = clock
        self.workers = workers
        self.log = log or (lambda *a, **k: None)
        hrrr_hi = grids.hrrr_output_grid(hrrr_width)
        # Output grids by target name. Differences use HRRR's lo grid; wind
        # vectors (particles need direction, not detail) use each model's lo grid.
        self.grid = {
            'hrrr-hi': hrrr_hi,
            'hrrr-lo': hrrr_hi.downsampled(2),
            'gfs-lo': grids.gfs_output_grid(gfs_width),
        }
        # Particles need direction, not detail: wind vectors at half the lo grid.
        self.grid['hrrr-wind'] = self.grid['hrrr-lo'].downsampled(2)
        self.grid['gfs-wind'] = self.grid['gfs-lo'].downsampled(2)
        self.levels = {'hrrr': ('lo', 'hi'), 'gfs': ('lo',)}
        self._luts = {}
        self.stats = {'framesWritten': 0, 'bytesWritten': 0, 'datasetMB': 0.0}
        self._stats_lock = threading.Lock()

    # ── geometry ──

    def lut(self, source: str, target: str):
        """LUT from a model's source grid to an output grid (a key of self.grid)."""
        key = (source, target)
        if key not in self._luts:
            grid = self.grid[target]
            self._luts[key] = grids.hrrr_lut(grid) if source == 'hrrr' else grids.gfs_lut(grid)
        return self._luts[key]

    def region(self, model: str):
        return (slice(None), slice(None)) if model == 'hrrr' else (grids.GFS_ROWS, grids.GFS_COLS)

    # ── planning ──

    def plan(self, model: str, previous: dict | None) -> ModelPlan | None:
        provider = self.providers[model]
        run_index = provider.run_index()
        grid = self.grid[f'{model}-lo']
        centre_lat = float(grids.inv_merc_y((grids.merc_y(grid.south) + grids.merc_y(grid.north)) / 2))
        centre = provider.locate(centre_lat, (grid.west + grid.east) / 2)
        newest = len(run_index.init_times) - 1
        fallback = None
        for pos in range(newest, max(-1, newest - RUN_CANDIDATES), -1):
            if previous and previous.get('id') == run_id(int(run_index.init_times[pos])) and previous.get('complete'):
                # Already published and complete: nothing newer is complete yet, or we'd have returned.
                plan = ModelPlan(provider, run_index, pos, len(previous['hours']), len(previous['hours']))
                plan.needs_build = False
                return plan
            probe = provider.read_point(pos, centre, [provider.COMPLETENESS_VAR])[provider.COMPLETENESS_VAR]
            missing = np.flatnonzero(~np.isfinite(probe))
            available = int(missing[0]) if missing.size else int(probe.size)
            expected = run_index.expected_lead_count(pos)
            if available >= expected:
                return ModelPlan(provider, run_index, pos, available, expected)
            if available > 0 and fallback is None:
                fallback = ModelPlan(provider, run_index, pos, available, expected)
        if fallback and previous and previous.get('id') == fallback.id and len(previous.get('hours', [])) >= len(fallback.hours):
            fallback.needs_build = False
        if fallback is None:
            raise NoDataError(f'No recent {model.upper()} run has data')
        return fallback

    # ── writing ──

    def _put_png(self, key: str, pixels: np.ndarray) -> None:
        body = encode_png(pixels)
        self.store.put(f'{KEY_PREFIX}/{key}', body, 'image/png', IMMUTABLE)
        with self._stats_lock:
            self.stats['framesWritten'] += 1
            self.stats['bytesWritten'] += len(body)

    def _read(self, plan: ModelPlan, sources) -> dict[str, np.ndarray]:
        rows, cols = self.region(plan.provider.id)
        out = {}
        for name in sources:
            arr = plan.provider.read_field(plan.pos, name, rows, cols)
            self.stats['datasetMB'] += arr.nbytes / 1e6
            out[name] = arr
        return out

    def _write_model_frames(self, pool, var, plan, raw, frames_out=None):
        """Derive, resample and write every hour of one variable for one model, at each resolution."""
        model = plan.provider.id
        luts = {res: self.lut(model, f'{model}-{res}') for res in self.levels[model]}
        state = {}
        futures = []
        for i, hour in enumerate(plan.hours):
            source_values = derive(var, raw, plan.run_index.lead_seconds, i, state)
            for res, lut in luts.items():
                values = lut.resample(source_values)
                if frames_out is not None and res == 'lo':
                    frames_out[plan.valid_times[i]] = values
                pixels = encode_bytes(values, var.lo, var.hi, var.transform)
                futures.append(pool.submit(self._put_png, f'{model}/{plan.id}/{var.id}/{res}/{hour:03d}.png', pixels))
        return futures

    def _write_wind_vectors(self, pool, plan, raw):
        model = plan.provider.id
        lut = self.lut(model, f'{model}-wind')
        if model == 'hrrr':
            cos_a, sin_a = grids.hrrr_rotation(lut.lon)
        futures = []
        for i, hour in enumerate(plan.hours):
            u = lut.resample(raw['wind_u_10m'][i])
            v = lut.resample(raw['wind_v_10m'][i])
            if model == 'hrrr':  # grid-relative → true north
                u, v = cos_a * u + sin_a * v, -sin_a * u + cos_a * v
            rgba = np.zeros((*u.shape, 4), dtype='uint8')
            rgba[..., 0] = encode_bytes(u, -WIND_VECTOR_RANGE, WIND_VECTOR_RANGE)
            rgba[..., 1] = encode_bytes(v, -WIND_VECTOR_RANGE, WIND_VECTOR_RANGE)
            rgba[..., 3] = np.where(np.isfinite(u) & np.isfinite(v), 255, 0)
            futures.append(pool.submit(self._put_png, f'{model}/{plan.id}/wind/{hour:03d}.png', rgba))
        return futures

    # ── main ──

    def run(self) -> dict:
        started = time.monotonic()
        previous = self.store.get_json(MANIFEST_KEY) or {}
        prev_models = previous.get('models', {})
        # A published run counts as built only if it has every variable this
        # code produces; adding a variable rebuilds the current run once.
        def published(m):
            prev = prev_models.get(m, {})
            expected = [v.id for v in FIELD_VARIABLES.values() if m in v.models]
            return prev.get('current') if prev.get('variables') == expected else None

        plans = {m: self.plan(m, published(m)) for m in ('hrrr', 'gfs')}
        hrrr, gfs = plans['hrrr'], plans['gfs']

        shared = sorted(set(hrrr.valid_times) & set(gfs.valid_times))
        diff_id = f'{hrrr.id}_{gfs.id}'
        prev_diff = previous.get('difference') or {}
        diff_needed = bool(shared) and not (prev_diff.get('id') == diff_id and prev_diff.get('validTimes') == [iso(t) for t in shared])

        if not (hrrr.needs_build or gfs.needs_build or diff_needed):
            self.log('INFO', 'fields_up_to_date', hrrr=hrrr.id, gfs=gfs.id, seconds=round(time.monotonic() - started, 1))
            return {'built': False, 'hrrr': hrrr.id, 'gfs': gfs.id, **self.stats}

        diff_vars = []
        with ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix='png') as pool:
            futures = []
            for var in FIELD_VARIABLES.values():
                need = {m: plans[m].needs_build and m in var.models for m in plans}
                want_diff = diff_needed and var.diff is not None
                if not (any(need.values()) or want_diff):
                    continue
                frames = {}
                for m in ('hrrr', 'gfs'):
                    if not (need[m] or want_diff):
                        continue
                    raw = self._read(plans[m], var.sources)
                    if need[m]:
                        futures += self._write_model_frames(pool, var, plans[m], raw, frames.setdefault(m, {}) if m == 'hrrr' and want_diff else None)
                        if var.id == 'windSpeed':
                            futures += self._write_wind_vectors(pool, plans[m], raw)
                    if want_diff and m == 'hrrr' and not need[m]:
                        self._collect(var, plans[m], raw, 'hrrr-lo', frames.setdefault('hrrr', {}))
                    if want_diff and m == 'gfs':
                        self._collect(var, plans[m], raw, 'hrrr-lo', frames.setdefault('gfs', {}))
                    del raw
                if want_diff:
                    written = self._write_diff(pool, var, plans, frames, shared, diff_id)
                    futures += written
                    if written:
                        diff_vars.append(var.id)
                frames.clear()
                # Surface write failures now, before the manifest can point at missing frames.
                for f in futures:
                    f.result()
                futures = []

        manifest = self._manifest(plans, shared if diff_needed or prev_diff.get('id') == diff_id else [],
                                  diff_id, diff_vars if diff_needed else prev_diff.get('variables', []))
        self.store.put(MANIFEST_KEY, _json(manifest), 'application/json', MANIFEST_CACHE)
        summary = {'built': True, 'hrrr': hrrr.id, 'gfs': gfs.id, 'seconds': round(time.monotonic() - started, 1), **self.stats}
        self.log('INFO', 'fields_built', **summary)
        return summary

    def _collect(self, var, plan, raw, target, out: dict):
        """Values of `var` on the `target` model's output grid, per valid time (for differences)."""
        lut = self.lut(plan.provider.id, target)
        state = {}
        for i, valid in enumerate(plan.valid_times):
            out[valid] = lut.resample(derive(var, raw, plan.run_index.lead_seconds, i, state))

    def _write_diff(self, pool, var, plans, frames, shared, diff_id):
        hrrr_frames, gfs_frames = frames.get('hrrr', {}), frames.get('gfs', {})
        futures = []
        for valid in shared:
            if valid not in hrrr_frames or valid not in gfs_frames:
                continue
            if var.time_semantics == 'period-average' and _period(plans['hrrr'], valid) != _period(plans['gfs'], valid):
                continue  # different averaging windows are not comparable
            delta = hrrr_frames[valid] - gfs_frames[valid]
            pixels = encode_bytes(delta, var.diff[0], var.diff[1])
            futures.append(pool.submit(self._put_png, f'diff/{diff_id}/{var.id}/{valid_id(valid)}.png', pixels))
        return futures

    def _manifest(self, plans, shared, diff_id, diff_vars) -> dict:
        models = {}
        for m, plan in plans.items():
            lo = self.grid[f'{m}-lo']
            hi = self.grid.get(f'{m}-hi')
            models[m] = {
                'name': plan.provider.name,
                'fullName': plan.provider.full_name,
                'resolution': plan.provider.resolution,
                'source': plan.provider.source(),
                'current': {
                    'id': plan.id, 'runTime': iso(plan.run_time), 'complete': plan.complete,
                    'hours': plan.hours, 'validTimes': [iso(t) for t in plan.valid_times],
                },
                'image': {
                    'coordinates': lo.coordinates, 'bounds': lo.bounds,
                    'levels': {'lo': [lo.width, lo.height], **({'hi': [hi.width, hi.height]} if hi else {})},
                },
                'wind': {'coordinates': lo.coordinates, 'size': [self.grid[f'{m}-wind'].width, self.grid[f'{m}-wind'].height],
                         'range': WIND_VECTOR_RANGE},
                'variables': [v.id for v in FIELD_VARIABLES.values() if m in v.models],
            }
        difference = None
        if shared and diff_vars:
            difference = {
                'id': diff_id,
                'subtract': 'HRRR − GFS',
                'hrrrRunTime': iso(plans['hrrr'].run_time),
                'gfsRunTime': iso(plans['gfs'].run_time),
                'validTimes': [iso(t) for t in shared],
                'variables': diff_vars,
                'image': {**models['hrrr']['image'], 'levels': {'lo': models['hrrr']['image']['levels']['lo']}},
            }
        return {
            'schemaVersion': SCHEMA_VERSION,
            'kind': 'model-field-manifest',
            'generatedAt': iso(int(self.clock())),
            'notice': 'Numerical weather model output, not observations. Images are 8-bit and for display only.',
            'keys': {
                'field': '{model}/{runId}/{variable}/{res}/{hour}.png',
                'wind': '{model}/{runId}/wind/{hour}.png',
                'difference': 'diff/{differenceId}/{variable}/{validId}.png',
                'hourFormat': '3-digit zero-padded forecast hour',
                'validIdFormat': 'YYYYMMDDTHHMMZ',
            },
            'models': models,
            'difference': difference,
            'variables': {k: v.to_manifest() for k, v in FIELD_VARIABLES.items()},
        }


def _period(plan: ModelPlan, valid: int):
    i = plan.valid_times.index(valid)
    return None if i == 0 else plan.valid_times[i] - plan.valid_times[i - 1]


def _json(obj) -> bytes:
    import json

    return json.dumps(obj, separators=(',', ':')).encode()
