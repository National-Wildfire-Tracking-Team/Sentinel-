"""
service.py
The weather-model service: picks the model and run, reads the point through
the cache, and builds the normalized response. No HTTP here (see app.py), so
tests drive it directly.

Run selection (per request, never a fixed run):
  1. Candidates are the newest RUN_CANDIDATES runs in the dataset, newest first.
  2. For each, read the completeness variable at the requested grid cell. The
     run's available hours are the lead times before its first missing value.
  3. Use the newest run whose available hours cover the request (capped at
     the run's planned length). A run still being ingested is used if it
     already covers the requested hours.
  4. If none covers it, use the run with the most hours, flagged incomplete.
  5. If no candidate has any data at that cell, it's NoDataError (503).
  `run.selection` in the response says which case applied.

Staleness: a run older than the model's stale_after_hours is returned with
`stale: true`; older than max_age_hours it's refused (503) rather than shown
as a forecast.

Model selection: `hrrr` and `gfs` return only that model, or an error. `auto`
uses HRRR when the point is inside the HRRR domain and the requested hours
are within HRRR's 48 h; otherwise GFS. If HRRR was chosen but has no usable
data, auto falls back to GFS and says so in `modelSelection`. The response's
`model` is always the model that produced the numbers.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np

import normalize
from cache import PointCache
from providers import NoDataError, OutOfDomainError, ProviderError
from providers.base import haversine_km

RUN_CANDIDATES = 3
SCHEMA_VERSION = 1
KIND = 'model-forecast'
NOTICE = ('Numerical weather model forecast. These values are model output, not observed conditions, '
          'and may differ from what is happening on the ground.')


class StaleDataError(ProviderError):
    code = 'stale_data'


class InvalidRequestError(ProviderError):
    code = 'invalid_parameter'


@dataclass
class ForecastRequest:
    lat: float
    lon: float
    model: str = 'auto'
    hours: int | None = None
    variables: tuple[str, ...] | None = None
    units: str = 'us'


@dataclass
class RequestStats:
    """What the HTTP layer logs and turns into metrics for one request."""

    model: str | None = None
    cache_hits: int = 0
    cache_misses: int = 0
    data_ms: float = 0.0
    stale: bool = False
    run_time: int | None = None
    selection: str | None = None
    fallback: bool = False
    extra: dict = field(default_factory=dict)


@dataclass
class RunChoice:
    pos: int
    run_time: int
    available_leads: int
    expected_leads: int
    reason: str

    @property
    def complete(self) -> bool:
        return self.available_leads >= self.expected_leads


def available_leads(series: np.ndarray) -> int:
    """Lead times before the first missing value."""
    missing = np.flatnonzero(~np.isfinite(series))
    return int(missing[0]) if missing.size else int(series.size)


class ForecastService:
    def __init__(self, providers: dict, *, cache: PointCache | None = None, clock=time.time):
        self.providers = providers
        self.cache = cache or PointCache()
        self.clock = clock

    # ── Reads ──

    def _read(self, provider, run_index, pos, point, variables, stats: RequestStats, complete_hint: bool):
        run_time = int(run_index.init_times[pos])
        found, missing = self.cache.get_many(provider.id, run_time, point, variables)
        stats.cache_hits += len(found)
        stats.cache_misses += len(missing)
        if missing:
            started = time.monotonic()
            fresh = provider.read_point(pos, point, missing)
            stats.data_ms += (time.monotonic() - started) * 1000
            self.cache.set_many(provider.id, run_time, point, fresh, complete_hint)
            found.update(fresh)
        return found

    def select_run(self, provider, run_index, point, hours: int, stats: RequestStats) -> RunChoice:
        newest = len(run_index.init_times) - 1
        needed_leads = int(np.searchsorted(run_index.lead_seconds, hours * 3600, side='right'))
        best: RunChoice | None = None
        for pos in range(newest, max(-1, newest - RUN_CANDIDATES), -1):
            expected = run_index.expected_lead_count(pos)
            # Whether the run is complete isn't known until it's read, so the
            # probe is cached as partial; a complete run's probe is re-cached
            # long-lived just below.
            probe = self._read(provider, run_index, pos, point, [provider.COMPLETENESS_VAR], stats, False)
            have = available_leads(probe[provider.COMPLETENESS_VAR])
            choice = RunChoice(pos, int(run_index.init_times[pos]), have, expected, '')
            if choice.complete:
                self.cache.set_many(provider.id, choice.run_time, point, probe, True)
            if have >= min(needed_leads, expected) and have > 0:
                choice.reason = 'latest' if pos == newest else 'newest-run-incomplete'
                return choice
            if have > 0 and (best is None or have > best.available_leads):
                best = choice
        if best is None:
            raise NoDataError(f'No {provider.name} run in the last {RUN_CANDIDATES} has data at this location yet')
        best.reason = 'partial-run'
        return best

    # ── Public API ──

    def resolve_model(self, req: ForecastRequest) -> tuple[str, str]:
        if req.model in self.providers:
            return req.model, 'requested'
        hrrr = self.providers.get('hrrr')
        within_hours = req.hours is None or req.hours <= hrrr.max_forecast_hours
        if hrrr and within_hours and hrrr.contains(req.lat, req.lon):
            return 'hrrr', 'auto: inside the HRRR domain and within 48 h'
        reason = 'auto: outside the HRRR domain' if within_hours else 'auto: beyond HRRR\'s 48 h'
        return 'gfs', reason

    def forecast(self, req: ForecastRequest, stats: RequestStats | None = None) -> dict:
        stats = stats or RequestStats()
        model_id, why = self.resolve_model(req)
        if req.model == 'auto' and model_id == 'hrrr':
            try:
                return self._forecast(self.providers['hrrr'], req, stats, {'mode': 'auto', 'reason': why})
            except ProviderError as exc:
                if isinstance(exc, (InvalidRequestError, OutOfDomainError)):
                    raise
                stats.fallback = True
                selection = {
                    'mode': 'auto',
                    'reason': f'auto: HRRR unavailable ({exc.code}), fell back to GFS',
                    'fallbackFrom': 'hrrr',
                }
                return self._forecast(self.providers['gfs'], req, stats, selection)
        mode = 'auto' if req.model == 'auto' else 'explicit'
        return self._forecast(self.providers[model_id], req, stats, {'mode': mode, 'reason': why})

    def _forecast(self, provider, req: ForecastRequest, stats: RequestStats, selection: dict) -> dict:
        stats.model = provider.id
        hours = req.hours if req.hours is not None else provider.default_forecast_hours
        if not 0 <= hours <= provider.max_forecast_hours:
            raise InvalidRequestError(f'hours must be between 0 and {provider.max_forecast_hours} for {provider.name}')

        requested = list(req.variables or normalize.DEFAULT_VARIABLES)
        variables = [v for v in requested if v in provider.SOURCES]
        unavailable = [v for v in requested if v not in provider.SOURCES]
        if not variables:
            raise InvalidRequestError(f'{provider.name} provides none of the requested variables: {", ".join(unavailable)}')

        point = provider.locate(req.lat, req.lon)
        run_index = provider.run_index()
        choice = self.select_run(provider, run_index, point, hours, stats)

        now = self.clock()
        age_s = now - choice.run_time
        stats.run_time = choice.run_time
        stats.selection = choice.reason
        if age_s > provider.max_age_hours * 3600:
            stats.stale = True
            raise StaleDataError(
                f'The newest usable {provider.name} run ({normalize.iso(choice.run_time)}) is older than '
                f'{provider.max_age_hours} h; not presenting it as a forecast')
        stale = age_s > provider.stale_after_hours * 3600
        stats.stale = stale

        dataset_vars = sorted({src for v in variables for src in provider.SOURCES[v]} | {provider.COMPLETENESS_VAR})
        raw = self._read(provider, run_index, choice.pos, point, dataset_vars, stats, choice.complete)

        needed = int(np.searchsorted(run_index.lead_seconds, hours * 3600, side='right'))
        lead_count = min(needed, choice.available_leads)
        forecast = normalize.build_series(provider, point, choice.run_time, run_index.lead_seconds, raw,
                                          variables, req.units, lead_count)

        newest_time = int(run_index.init_times[-1])
        described = provider.describe()
        return {
            'schemaVersion': SCHEMA_VERSION,
            'kind': KIND,
            'notice': NOTICE,
            'model': {k: described[k] for k in ('id', 'name', 'fullName', 'operator', 'resolution', 'domain')},
            'modelSelection': {'requested': req.model, **selection},
            'source': {**provider.source(), 'snapshot': provider.snapshot_id},
            'location': {'lat': req.lat, 'lon': req.lon},
            'gridPoint': {
                'lat': round(point.lat, 5),
                'lon': round(point.lon, 5),
                'distanceKm': round(haversine_km(req.lat, req.lon, point.lat, point.lon), 2),
                'method': 'nearest grid cell',
            },
            'run': {
                'runTime': normalize.iso(choice.run_time),
                'ageMinutes': int(age_s // 60),
                'stale': stale,
                'staleAfterHours': provider.stale_after_hours,
                'complete': choice.complete,
                'forecastHoursAvailable': int(round(run_index.lead_seconds[choice.available_leads - 1] / 3600)),
                'forecastHoursExpected': int(round(run_index.lead_seconds[choice.expected_leads - 1] / 3600)),
                'selection': choice.reason,
                'newestRunTime': normalize.iso(newest_time),
            },
            'retrievedAt': normalize.iso(now),
            'requestedHours': hours,
            'units': normalize.units_block(variables, req.units),
            'unitSystem': req.units,
            'variables': normalize.variables_block(variables),
            'unavailableVariables': unavailable,
            'forecast': forecast,
        }

    def models(self) -> dict:
        """Catalog for the frontend: each model, its newest run, and its coverage."""
        out = []
        for provider in self.providers.values():
            entry = provider.describe()
            entry['coverage'] = provider.domain_geojson()
            try:
                run_index = provider.run_index()
                newest = int(run_index.init_times[-1])
                entry['status'] = 'available'
                entry['newestRunTime'] = normalize.iso(newest)
                entry['newestRunAgeMinutes'] = int((self.clock() - newest) // 60)
                entry['leadHours'] = [int(round(s / 3600)) for s in run_index.lead_seconds]
            except ProviderError as exc:
                entry['status'] = 'unavailable'
                entry['error'] = exc.code
            out.append(entry)
        return {
            'schemaVersion': SCHEMA_VERSION,
            'kind': 'model-catalog',
            'generatedAt': normalize.iso(self.clock()),
            'variables': normalize.variables_block(list(normalize.VARIABLES)),
            'defaultVariables': list(normalize.DEFAULT_VARIABLES),
            'unitSystems': normalize.UNIT_SYSTEMS,
            'models': out,
        }
