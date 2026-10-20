"""
builder.py
One run: pull NFDRS station values from FEMS, publish them for the map, and
write the manifest last.

Published (under fire-danger/v1/ in the frames bucket, served at /fire-danger/*):
  runs/<run>/stations.json       GeoJSON: one point per active FEMS station,
                                 latest observed day + 7-day forecast ERC/BI
  runs/<run>/stations/<id>.json  one station's observed window and forecast
  manifest.json                  what's current, per-source status and times

A run directory is never rewritten (cached immutable); the manifest is the
only mutable object. If the station data is unchanged since the last run,
nothing new is written except the manifest's retrieval time.

Failure handling, per source:
  - station list or most batches fail: the previous run stays published and
    the source is marked `error` with the time of its last success;
  - a few batches fail: the run is published, marked `partial`, and the
    missing stations are listed as having no current data;
  - never: a value carried over or filled in for a station FEMS didn't return.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import time

import fems
import wfpi

KEY_PREFIX = 'fire-danger/v1/'
MANIFEST_KEY = KEY_PREFIX + 'manifest.json'
SCHEMA_VERSION = 1
# GeoJSON served as application/json: CloudFront compresses that at the edge
# but not application/geo+json (1.2 MB vs ~200 KB for a national run).
STATIONS_CONTENT_TYPE = 'application/json'

FEMS_LABEL = 'USDA Forest Service FEMS · NFDRS 2016 station values'
FEMS_URL = 'https://fems.fs2c.usda.gov'
FEMS_NOTE = ('NFDRS 2016 outputs (fuel model Y) computed by FEMS for each weather station: observed days and '
             "FEMS's 7-day forecast. Values apply at the station, not between stations. Live (herb and woody) fuel "
             'moisture here is modelled by NFDRS, not measured.')

# Publish a run only if at least this share of batches succeeded.
MIN_BATCH_SUCCESS = 0.8
# FEMS answers the odd request with a 502; one retry after a pause clears it.
BATCH_RETRY_DELAY_SECONDS = 3
# The latest observed day FEMS returned was yesterday (UTC) in every pull
# tried; older than this many days means the source has stopped updating.
OBSERVED_STALE_DAYS = 3

WFPI_LABEL = 'USGS EROS · Wildland Fire Potential Index (WFPI) forecast'
WFPI_URL = 'https://www.usgs.gov/fire-danger-forecast/wildland-fire-potential-index-wfpi'
WFPI_NOTE = ('A USGS model of vegetation flammability (0-150, unit-less) from forecast weather, fuel moisture and '
             'satellite greenness, on a ~1 km grid over CONUS. It is not an NFDRS index or an official rating.')

MAP_FIELDS = ('erc', 'bi', 'sc', 'ic', 'fm1', 'fm10', 'fm100', 'fm1000', 'herbFM', 'woodyFM', 'kbdi', 'gsi')


def _json_bytes(obj) -> bytes:
    return json.dumps(obj, separators=(',', ':'), sort_keys=True).encode()


def _iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def station_feature(station: dict, data: dict | None) -> dict:
    """One map point. No observed day → `observedDate` None and no values."""
    observed = (data or {}).get('observed', [])
    forecast = (data or {}).get('forecast', [])
    latest = observed[-1] if observed else None
    props = {
        'id': station['id'],
        'name': station['name'],
        'state': station['state'],
        'observedDate': latest['date'] if latest else None,
        'qa': latest['qa'] if latest else None,
    }
    for field in MAP_FIELDS:
        props[field] = latest.get(field) if latest else None
    props['ercChange7d'] = fems.trend(observed, 'erc')
    props['fm100Change7d'] = fems.trend(observed, 'fm100')
    props['forecastDates'] = [d['date'] for d in forecast]
    props['forecastErc'] = [d['erc'] for d in forecast]
    props['forecastBi'] = [d['bi'] for d in forecast]
    return {
        'type': 'Feature',
        'geometry': {'type': 'Point', 'coordinates': [station['lon'], station['lat']]},
        'properties': props,
    }


class FireDangerBuilder:
    def __init__(self, store, source=None, clock=time.time, log=None, sleep=time.sleep, wfpi_source=None):
        self.store = store
        self.source = source or fems.FemsSource()
        self.wfpi_source = wfpi_source or wfpi.WfpiSource()
        self.clock = clock
        self.log = log or (lambda *a, **k: None)
        self.sleep = sleep

    def _summary_with_retry(self, batch, start, end) -> str:
        try:
            return self.source.daily_summary(batch, start, end)
        except fems.SourceError as exc:
            self.log('INFO', 'fems_batch_retry', first_station=batch[0], error=str(exc)[:200])
            self.sleep(BATCH_RETRY_DELAY_SECONDS)
            return self.source.daily_summary(batch, start, end)

    def run(self) -> dict:
        now = self.clock()
        previous = self.store.get_json(MANIFEST_KEY) or {}
        prev_fems = (previous.get('sources') or {}).get('fems') or {}
        prev_products = previous.get('products') or {}

        summary = {'bytesWritten': 0, 'objectsWritten': 0, 'sources': {}}
        fems_status, products = self._build_fems(now, prev_fems, prev_products, summary)
        summary['sources']['fems'] = fems_status
        summary['sources']['wfpi'] = self._build_wfpi(now, (previous.get('sources') or {}).get('wfpi') or {})

        manifest = {
            'schemaVersion': SCHEMA_VERSION,
            'kind': 'sentinel-fire-danger',
            'generatedAt': _iso(now),
            'sources': summary['sources'],
            'products': products,
        }
        body = _json_bytes(manifest)
        self.store.put(MANIFEST_KEY, body, 'application/json', self.store.MANIFEST_CACHE)
        summary['bytesWritten'] += len(body)
        summary['objectsWritten'] += 1
        summary['manifest'] = manifest
        return summary

    def _build_wfpi(self, now: float, prev: dict) -> dict:
        base = {'label': WFPI_LABEL, 'url': WFPI_URL, 'note': WFPI_NOTE}
        try:
            dates = wfpi.valid_dates(self.wfpi_source)
        except wfpi.SourceError as exc:
            self.log('WARNING', 'wfpi_failed', error=str(exc)[:300])
            # Keep the last known dates, marked as such; the client says so.
            return {**prev, **base, 'status': 'error', 'error': str(exc)[:300], 'attemptedAt': _iso(now)}
        today = dt.datetime.fromtimestamp(now, dt.timezone.utc).date().isoformat()
        return {
            **base,
            'status': 'ok',
            'validDates': dates,
            # The newest run's last day should be ahead of today; if not, USGS has stopped updating.
            'stale': dates[-1] < today,
            'retrievedAt': _iso(now),
            'lastSuccessAt': _iso(now),
        }

    def _build_fems(self, now: float, prev: dict, prev_products: dict, summary: dict):
        base_status = {'label': FEMS_LABEL, 'url': FEMS_URL, 'note': FEMS_NOTE, 'fuelModel': fems.FUEL_MODEL}
        retrieved_at = _iso(now)
        kept = {k: v for k, v in prev_products.items() if k == 'stations'}

        def failed(error: str):
            self.log('WARNING', 'fems_failed', error=error[:300])
            # Keep serving the last good run; say when it was from.
            return ({
                **{k: v for k, v in prev.items() if k not in ('status', 'error', 'retrievedAt')},
                **base_status,
                'status': 'error',
                'error': error[:300],
                'retrievedAt': prev.get('retrievedAt'),
                'attemptedAt': retrieved_at,
                'lastSuccessAt': prev.get('lastSuccessAt'),
            }, kept)

        try:
            stations = fems.active_stations(self.source.stations())
        except fems.SourceError as exc:
            return failed(f'station list: {exc}')
        if not stations:
            return failed('station list: no active stations')

        today = dt.datetime.fromtimestamp(now, dt.timezone.utc).date()
        start = today - dt.timedelta(days=fems.HISTORY_DAYS)
        end = today + dt.timedelta(days=8)
        by_id = {s['id']: s for s in stations}
        data: dict[int, dict] = {}
        n_batches = n_failed = 0
        for batch in fems.batches([s['id'] for s in stations]):
            n_batches += 1
            try:
                data.update({k: v for k, v in fems.parse_summary(self._summary_with_retry(batch, start, end)).items() if k in by_id})
            except fems.SourceError as exc:
                n_failed += 1
                self.log('WARNING', 'fems_batch_failed', first_station=batch[0], error=str(exc)[:200])
        if n_batches == 0 or (n_batches - n_failed) / n_batches < MIN_BATCH_SUCCESS:
            return failed(f'{n_failed} of {n_batches} station batches failed')

        features = [station_feature(s, data.get(s['id'])) for s in stations]
        observed_dates = [f['properties']['observedDate'] for f in features if f['properties']['observedDate']]
        forecast_dates = [d for f in features for d in f['properties']['forecastDates']]
        with_data = len(observed_dates)
        latest_observed = max(observed_dates) if observed_dates else None

        collection = {'type': 'FeatureCollection', 'features': features}
        payload = _json_bytes(collection)
        # The content type is part of the digest so a change to how the file is
        # served also publishes a fresh run (the old one is cached immutable).
        digest = hashlib.sha256(payload + STATIONS_CONTENT_TYPE.encode()).hexdigest()[:16]

        if digest == prev.get('digest') and kept.get('stations'):
            products = kept  # unchanged: nothing new to write
            self.log('INFO', 'fems_unchanged', digest=digest)
        else:
            run = dt.datetime.fromtimestamp(now, dt.timezone.utc).strftime('%Y%m%dT%H%MZ')
            run_prefix = f'{KEY_PREFIX}runs/{run}/'
            for sid, station_data in data.items():
                detail = {
                    'station': by_id[sid],
                    'fuelModel': fems.FUEL_MODEL,
                    'retrievedAt': retrieved_at,
                    'observed': station_data['observed'],
                    'forecast': station_data['forecast'],
                }
                body = _json_bytes(detail)
                self.store.put(f'{run_prefix}stations/{sid}.json', body, 'application/json', self.store.IMMUTABLE)
                summary['bytesWritten'] += len(body)
                summary['objectsWritten'] += 1
            self.store.put(f'{run_prefix}stations.json', payload, STATIONS_CONTENT_TYPE, self.store.IMMUTABLE)
            summary['bytesWritten'] += len(payload)
            summary['objectsWritten'] += 1
            products = {'stations': {
                'path': f'runs/{run}/stations.json',
                'detailPath': f'runs/{run}/stations/{{id}}.json',
                'run': run,
            }}

        stale = latest_observed is None or (today - dt.date.fromisoformat(latest_observed)).days > OBSERVED_STALE_DAYS
        status = 'partial' if n_failed else 'ok'
        return ({
            **base_status,
            'status': status,
            'stale': stale,
            'retrievedAt': retrieved_at,
            'lastSuccessAt': retrieved_at,
            'stations': len(stations),
            'stationsWithCurrentData': with_data,
            'latestObservedDate': latest_observed,
            'forecastThrough': max(forecast_dates) if forecast_dates else None,
            'failedBatches': n_failed,
            'batches': n_batches,
            'digest': digest,
        }, products)
