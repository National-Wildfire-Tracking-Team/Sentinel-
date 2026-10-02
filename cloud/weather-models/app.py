"""
app.py
weather-models — HTTP service (AWS Lambda via the Lambda Web Adapter, or any
container). Serves normalized point forecasts from NOAA HRRR and GFS read
straight from the dynamical.org Icechunk datasets on AWS Open Data.

GET /v1/forecast?lat=&lon=[&model=auto|hrrr|gfs][&hours=][&variables=a,b][&units=us|si]
GET /v1/models   → model catalog: newest runs, lead hours, coverage, variables
GET /health      → counters only; never touches S3 (it's the readiness check)
POST /events     → keep-warm (an EventBridge schedule, which the Lambda Web
                   Adapter forwards here): opens each dataset's session and
                   reads its run index so a user's first click doesn't pay
                   for them. Not reachable through CloudFront (GET only).

The request handling is the pure function `handle()`, so tests call it
without a socket. See README.md for the contract.
"""

from __future__ import annotations

import gzip
import json
import math
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

import normalize
from cache import PointCache, RateLimiter
from metrics import log
from providers import PROVIDER_CLASSES, DatasetError, NoDataError, OutOfDomainError, ProviderError
from service import (
    SCHEMA_VERSION,
    ForecastRequest,
    ForecastService,
    InvalidRequestError,
    RequestStats,
    StaleDataError,
)

PORT = int(os.environ.get('PORT', '8080'))
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', '').split(',') if o.strip()]
RATE_LIMIT_PER_MINUTE = int(os.environ.get('WEATHER_MODELS_RATE_LIMIT_PER_MINUTE', '120'))
# Development only: serve a local field build (python -m fields <dir>) at
# /fields/*. In production CloudFront serves that path from S3 and this is unset.
FIELDS_DIR = os.environ.get('WEATHER_MODELS_FIELDS_DIR')

# Edge (CloudFront) cache lifetimes. A new run appears every 6 h, so a
# complete answer can be shared for a while; anything provisional is
# re-checked soon so the next run (or the rest of this one) shows up.
S_MAXAGE_COMPLETE = int(os.environ.get('WEATHER_MODELS_S_MAXAGE_SECONDS', '600'))
S_MAXAGE_PROVISIONAL = 120
S_MAXAGE_CATALOG = 300

STATUS_BY_ERROR = {
    InvalidRequestError: 400,
    OutOfDomainError: 422,
    NoDataError: 503,
    StaleDataError: 503,
    DatasetError: 502,
}

# Where the Lambda Web Adapter delivers non-HTTP events (its default
# AWS_LWA_PASS_THROUGH_PATH): here, only the keep-warm schedule.
WARM_PATH = '/events'

MODELS = ('auto', *PROVIDER_CLASSES)
UNITS = tuple(normalize.UNIT_SYSTEMS)
MAX_HOURS = max(cls.max_forecast_hours for cls in PROVIDER_CLASSES.values())


def build_service(env=os.environ) -> ForecastService:
    chunk_mb = int(env.get('WEATHER_MODELS_CHUNK_CACHE_MB', '256'))
    session_ttl = float(env.get('WEATHER_MODELS_SESSION_TTL_SECONDS', '60'))
    providers = {}
    for model_id, cls in PROVIDER_CLASSES.items():
        provider = cls(session_ttl_s=session_ttl, chunk_cache_bytes=chunk_mb * 1024 * 1024)
        prefix = model_id.upper()
        provider.stale_after_hours = float(env.get(f'{prefix}_STALE_AFTER_HOURS', provider.stale_after_hours))
        provider.max_age_hours = float(env.get(f'{prefix}_MAX_AGE_HOURS', provider.max_age_hours))
        providers[model_id] = provider
    cache = PointCache(max_entries=int(env.get('WEATHER_MODELS_POINT_CACHE_ENTRIES', '20000')))
    return ForecastService(providers, cache=cache)


class Response:
    def __init__(self, status: int, body: dict | None, headers: dict | None = None, raw: bytes | None = None):
        self.status = status
        self.body = body
        self.headers = headers or {}
        self.raw = raw

    @property
    def json(self) -> dict | None:
        return self.body


def error(status: int, code: str, message: str) -> Response:
    return Response(status, {'schemaVersion': SCHEMA_VERSION, 'error': {'code': code, 'message': message}},
                    {'Cache-Control': 'no-store'})


def _one(query: dict, *names: str) -> str | None:
    for name in names:
        values = query.get(name)
        if values:
            return values[-1].strip()
    return None


def _coordinate(raw: str | None, name: str, limit: float) -> float:
    if raw is None or raw == '':
        raise InvalidRequestError(f'{name} is required')
    try:
        value = float(raw)
    except ValueError:
        raise InvalidRequestError(f'{name} must be a number') from None
    if not math.isfinite(value) or not -limit <= value <= limit:
        raise InvalidRequestError(f'{name} must be between {-limit:g} and {limit:g}')
    return value


def parse_forecast_request(query: dict) -> ForecastRequest:
    lat = _coordinate(_one(query, 'lat', 'latitude'), 'lat', 90)
    lon = _coordinate(_one(query, 'lon', 'lng', 'longitude'), 'lon', 180)

    model = (_one(query, 'model') or 'auto').lower()
    if model not in MODELS:
        raise InvalidRequestError(f'model must be one of: {", ".join(MODELS)}')

    hours = None
    raw_hours = _one(query, 'hours', 'forecastHours')
    if raw_hours:
        if not raw_hours.isdigit():
            raise InvalidRequestError('hours must be a whole number')
        hours = int(raw_hours)
        if hours > MAX_HOURS:
            raise InvalidRequestError(f'hours must be at most {MAX_HOURS}')

    variables = None
    raw_vars = _one(query, 'variables')
    if raw_vars:
        variables = tuple(dict.fromkeys(v.strip() for v in raw_vars.split(',') if v.strip()))
        unknown = [v for v in variables if v not in normalize.VARIABLES]
        if unknown:
            raise InvalidRequestError(
                f'unknown variable(s): {", ".join(unknown)}. Known: {", ".join(normalize.VARIABLES)}')

    units = (_one(query, 'units') or 'us').lower()
    if units not in UNITS:
        raise InvalidRequestError(f'units must be one of: {", ".join(UNITS)}')

    return ForecastRequest(lat=lat, lon=lon, model=model, hours=hours, variables=variables, units=units)


class App:
    def __init__(self, service: ForecastService, *, rate_limit_per_minute: int = RATE_LIMIT_PER_MINUTE):
        self.service = service
        self.limiter = RateLimiter(rate_limit_per_minute)
        self.counters = {'requests': 0, 'errors': 0, 'rateLimited': 0, 'datasetErrors': 0, 'staleEvents': 0}

    def handle(self, method: str, target: str, client: str = 'unknown') -> Response:
        if method == 'OPTIONS':
            return Response(204, None)
        parts = urlsplit(target)
        if method == 'POST' and parts.path == WARM_PATH:
            return self._warm()
        if method not in ('GET', 'HEAD'):
            return error(405, 'method_not_allowed', 'Only GET is supported')
        query = parse_qs(parts.query, keep_blank_values=True)
        if parts.path == '/health':
            return Response(200, {
                'ok': True,
                'schemaVersion': SCHEMA_VERSION,
                'counters': self.counters,
                'pointCache': self.service.cache.stats,
            }, {'Cache-Control': 'no-store'})
        if parts.path == '/v1/models':
            return self._models()
        if parts.path.startswith('/fields/') and FIELDS_DIR:
            return local_field(FIELDS_DIR, parts.path)
        if parts.path == '/v1/forecast':
            if not self.limiter.allow(client):
                self.counters['rateLimited'] += 1
                resp = error(429, 'rate_limited', 'Too many requests; please slow down')
                resp.headers['Retry-After'] = '60'
                return resp
            return self._forecast(query)
        return error(404, 'not_found', 'Not found')

    def _warm(self) -> Response:
        started = time.monotonic()
        status = {m['id']: m['status'] for m in self.service.models()['models']}
        log('INFO', 'warm', latencyMs=round((time.monotonic() - started) * 1000), models=status)
        return Response(200, {'ok': True, 'models': status}, {'Cache-Control': 'no-store'})

    def _models(self) -> Response:
        started = time.monotonic()
        body = self.service.models()
        degraded = any(m['status'] != 'available' for m in body['models'])
        log('WARNING' if degraded else 'INFO', 'models', latencyMs=round((time.monotonic() - started) * 1000),
            degraded=degraded)
        cache = 'no-store' if degraded else f'public, max-age=0, s-maxage={S_MAXAGE_CATALOG}, must-revalidate'
        return Response(200, body, {'Cache-Control': cache})

    def _forecast(self, query: dict) -> Response:
        started = time.monotonic()
        self.counters['requests'] += 1
        stats = RequestStats()
        requested_model = None
        status, code = 200, None
        try:
            req = parse_forecast_request(query)
            requested_model = req.model
            body = self.service.forecast(req, stats)
            run = body['run']
            provisional = run['stale'] or not run['complete'] or run['selection'] != 'latest' or stats.fallback
            s_maxage = S_MAXAGE_PROVISIONAL if provisional else S_MAXAGE_COMPLETE
            resp = Response(200, body, {
                'Cache-Control': f'public, max-age=0, s-maxage={s_maxage}, must-revalidate',
                'X-Sentinel-Cache': 'hit' if stats.cache_misses == 0 else 'miss',
            })
        except ProviderError as exc:
            status = STATUS_BY_ERROR.get(type(exc), 502)
            code = exc.code
            resp = error(status, code, str(exc))
        except Exception as exc:  # never let a bug surface as a fabricated or partial forecast
            status, code = 500, 'internal_error'
            resp = error(500, code, 'The forecast could not be processed')
            log('ERROR', 'forecast_exception', error=type(exc).__name__, detail=str(exc)[:300])

        if status >= 400:
            self.counters['errors'] += 1
        dataset_error = code == 'dataset_error'
        self.counters['datasetErrors'] += int(dataset_error)
        self.counters['staleEvents'] += int(stats.stale)
        severity = 'ERROR' if status >= 500 and status != 503 else 'WARNING' if status >= 400 or stats.stale else 'INFO'
        # Counts and timings only — never the requested location.
        log(severity, 'forecast', {
            'weather_requests': 1,
            'hrrr_requests': int(stats.model == 'hrrr'),
            'gfs_requests': int(stats.model == 'gfs'),
            'cache_hits': stats.cache_hits,
            'cache_misses': stats.cache_misses,
            'model_data_latency': round(stats.data_ms, 1) if stats.cache_misses else None,
            'dataset_errors': int(dataset_error),
            'stale_data_events': int(stats.stale),
        }, status=status, errorCode=code, requestedModel=requested_model, model=stats.model,
            runTime=normalize.iso(stats.run_time) if stats.run_time else None, runSelection=stats.selection,
            fallback=stats.fallback, latencyMs=round((time.monotonic() - started) * 1000))
        return resp


def local_field(root: str, path: str) -> Response:
    """Development only: a file from a local field build, never outside `root`."""
    base = os.path.realpath(os.path.join(root, 'weather-models'))
    target = os.path.realpath(os.path.join(base, path.lstrip('/')))
    if not target.startswith(base + os.sep) or not os.path.isfile(target):
        return error(404, 'not_found', 'Not found')
    with open(target, 'rb') as fh:
        body = fh.read()
    kind = 'image/png' if target.endswith('.png') else 'application/json'
    cache = 'no-store' if target.endswith('.json') else 'public, max-age=31536000, immutable'
    return Response(200, None, {'Content-Type': kind, 'Cache-Control': cache}, raw=body)


def cors_headers(origin: str | None) -> dict:
    allow = '*'
    if ALLOWED_ORIGINS:
        allow = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    headers = {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Expose-Headers': 'X-Sentinel-Cache',
    }
    if ALLOWED_ORIGINS:
        headers['Vary'] = 'Origin'
    return headers


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'sentinel-weather-models'
        protocol_version = 'HTTP/1.1'

        def _respond(self, head_only=False):
            fwd = (self.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
            resp = app.handle(self.command, self.path, fwd or self.client_address[0])
            headers = {**cors_headers(self.headers.get('Origin')), **resp.headers}
            payload = resp.raw or b''
            if resp.body is not None:
                payload = json.dumps(resp.body, separators=(',', ':')).encode()
                headers['Content-Type'] = 'application/json'
                if len(payload) > 1024 and 'gzip' in (self.headers.get('Accept-Encoding') or ''):
                    payload = gzip.compress(payload, compresslevel=6)
                    headers['Content-Encoding'] = 'gzip'
                headers['Vary'] = f"{headers['Vary']}, Accept-Encoding" if 'Vary' in headers else 'Accept-Encoding'
            headers['Content-Length'] = str(len(payload))
            self.send_response(resp.status)
            for k, v in headers.items():
                self.send_header(k, v)
            self.end_headers()
            if payload and not head_only:
                self.wfile.write(payload)

        def do_GET(self):  # noqa: N802 (http.server naming)
            self._respond()

        def do_HEAD(self):  # noqa: N802
            self._respond(head_only=True)

        def do_OPTIONS(self):  # noqa: N802
            self._respond()

        def do_POST(self):  # noqa: N802
            # Drain the body (the adapter's event JSON) so a kept-alive
            # connection's next request starts at the right byte.
            length = int(self.headers.get('Content-Length') or 0)
            if length:
                self.rfile.read(length)
            self._respond()

        def log_message(self, *args):  # the structured request log replaces http.server's
            pass

    return Handler


def main():
    app = App(build_service())
    server = ThreadingHTTPServer(('0.0.0.0', PORT), make_handler(app))
    log('INFO', 'listening', port=PORT, models=list(PROVIDER_CLASSES))
    server.serve_forever()


if __name__ == '__main__':
    main()
