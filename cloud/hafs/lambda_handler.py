"""
lambda_handler.py
HTTP around service.py: a Lambda Function URL handler (payload v2, behind
CloudFront at /hafs/*) and the pure `handle()` it and local.py share, so
tests call it without a socket. See README.md for the contract.

  GET /v1/catalog                                            runs, storms, domains and fields
  GET /v1/runs/{model}/{cycle}/{storm}                       one run: frame corners and field hours
  GET /v1/frames/{model}/{cycle}/{storm}/{domain}/{field}/{hour}.png
                                                             one 8-bit frame (byte 0 = no data)
  GET /health                                                counters only; never reads NOAA

Every path segment is validated by pattern before it reaches the service,
and the service validates it again against the model, domain and field
registries. Query strings are refused, so CloudFront's cache key is the path.
"""

from __future__ import annotations

import base64
import json
import os
import re
import threading
import time

from grib2 import UnsupportedGrib
from idx import IdxError
from metrics import log
from service import SCHEMA_VERSION, HafsService, RequestError
from source import HafsSource, SourceError

PATH_PREFIX = '/hafs'
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', '').split(',') if o.strip()]
RATE_LIMIT_PER_MINUTE = int(os.environ.get('HAFS_RATE_LIMIT_PER_MINUTE', '600'))

# Edge and browser cache lifetimes. A NOAA file never changes once it and its
# .idx are written, so a frame is immutable. The catalog changes as runs
# arrive; a run's detail changes until the run settles (service.py _listing).
CACHE_CATALOG = 'public, max-age=60, s-maxage=60'
CACHE_RUN_LIVE = 'public, max-age=60, s-maxage=60'
CACHE_RUN_SETTLED = 'public, max-age=3600, s-maxage=86400'
CACHE_FRAME = 'public, max-age=31536000, immutable'

_SEG = r'[a-z0-9]{1,16}'
RUN_RE = re.compile(rf'^/v1/runs/(?P<model>{_SEG})/(?P<cycle>\d{{10}})/(?P<storm>\d{{2}}[a-z])$')
FRAME_RE = re.compile(rf'^/v1/frames/(?P<model>{_SEG})/(?P<cycle>\d{{10}})/(?P<storm>\d{{2}}[a-z])/'
                      rf'(?P<domain>{_SEG})/(?P<field>[A-Za-z0-9]{{1,32}})/(?P<hour>\d{{1,3}})\.png$')


class RateLimiter:
    """Fixed-window per-client limiter (cloud/weather-models/cache.py's). Only CloudFront misses reach here."""

    def __init__(self, limit: int, window_s: float = 60, clock=time.monotonic):
        self._limit = limit
        self._window_s = window_s
        self._clock = clock
        self._hits: dict[str, tuple[float, int]] = {}
        self._lock = threading.Lock()

    def allow(self, client: str) -> bool:
        if self._limit <= 0:
            return True
        now = self._clock()
        with self._lock:
            start, count = self._hits.get(client, (now, 0))
            if now - start >= self._window_s:
                start, count = now, 0
            if count >= self._limit:
                return False
            self._hits[client] = (start, count + 1)
            if len(self._hits) > 10000:
                self._hits = {k: v for k, v in self._hits.items() if now - v[0] < self._window_s}
            return True


class Response:
    def __init__(self, status: int, body: dict | bytes | None, headers: dict | None = None):
        self.status = status
        self.body = body
        self.headers = headers or {}

    @property
    def json(self) -> dict | None:
        return self.body if isinstance(self.body, dict) else None

    def payload(self) -> bytes:
        if self.body is None:
            return b''
        if isinstance(self.body, bytes):
            return self.body
        return json.dumps(self.body, separators=(',', ':')).encode()

    @property
    def content_type(self) -> str:
        return self.headers.get('Content-Type') or ('application/json' if isinstance(self.body, dict) else 'text/plain')


def error(status: int, code: str, message: str) -> Response:
    return Response(status, {'schemaVersion': SCHEMA_VERSION, 'error': {'code': code, 'message': message}},
                    {'Cache-Control': 'no-store'})


def cors_headers(origin: str | None, allowed=None) -> dict:
    allowed = ALLOWED_ORIGINS if allowed is None else allowed
    if not allowed:
        return {'Access-Control-Allow-Origin': '*'}
    headers = {'Vary': 'Origin'}
    if origin and origin in allowed:
        headers['Access-Control-Allow-Origin'] = origin
    return headers


class App:
    def __init__(self, service: HafsService, *, rate_limit_per_minute: int = RATE_LIMIT_PER_MINUTE, allowed_origins=None):
        self.service = service
        self.limiter = RateLimiter(rate_limit_per_minute)
        self.allowed_origins = allowed_origins
        self.counters = {'requests': 0, 'frames': 0, 'clientErrors': 0, 'serverErrors': 0, 'upstreamErrors': 0,
                         'rateLimited': 0}

    def handle(self, method: str, path: str, query: str = '', client: str = 'unknown', origin: str | None = None) -> Response:
        started = time.monotonic()
        self.counters['requests'] += 1
        resp = self._route(method, path, query, client)
        resp.headers.update(cors_headers(origin, self.allowed_origins))
        if method == 'HEAD':
            resp.headers.setdefault('Content-Type', resp.content_type)
            resp.body = None
        ms = round((time.monotonic() - started) * 1000)
        if resp.status >= 500:
            self.counters['serverErrors' if resp.status != 502 else 'upstreamErrors'] += 1
        elif resp.status >= 400:
            self.counters['clientErrors'] += 1
        log('ERROR' if resp.status >= 500 else 'INFO', 'request', {
            'hafs_request_ms': ms,
            'hafs_server_errors': int(resp.status >= 500 and resp.status != 502),
            'hafs_upstream_errors': int(resp.status == 502),
        }, method=method, path=path[:200], status=resp.status)
        return resp

    def _route(self, method: str, path: str, query: str, client: str) -> Response:
        if method == 'OPTIONS':
            return Response(204, None, {'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                                        'Access-Control-Max-Age': '86400'})
        if method not in ('GET', 'HEAD'):
            return error(405, 'method_not_allowed', 'Only GET is supported.')
        if path == PATH_PREFIX or path.startswith(PATH_PREFIX + '/'):
            path = path[len(PATH_PREFIX):] or '/'
        if path == '/health':
            return Response(200, {'ok': True, 'schemaVersion': SCHEMA_VERSION, 'counters': self.counters,
                                  'frames': self.service.stats, 'source': getattr(self.service.source, 'stats', {})},
                            {'Cache-Control': 'no-store'})
        if query:
            return error(400, 'bad_request', 'Query parameters are not supported.')
        run = RUN_RE.match(path)
        frame = FRAME_RE.match(path)
        if path != '/v1/catalog' and not run and not frame:
            return error(404, 'not_found', 'Not found.')
        if (run or frame) and not self.limiter.allow(client):
            self.counters['rateLimited'] += 1
            resp = error(429, 'rate_limited', 'Too many requests; please slow down.')
            resp.headers['Retry-After'] = '60'
            return resp
        try:
            if run:
                return self._run(**run.groupdict())
            if frame:
                return self._frame(**frame.groupdict())
            return Response(200, self.service.catalog(), {'Cache-Control': CACHE_CATALOG})
        except RequestError as exc:
            return error(exc.status, exc.code, str(exc))
        except (SourceError, UnsupportedGrib, IdxError) as exc:
            log('WARNING', 'hafs_upstream_failed', error=type(exc).__name__, detail=str(exc)[:300], path=path[:200])
            return error(502, 'upstream_unavailable', 'NOAA HAFS data could not be read; try again shortly.')
        except Exception as exc:  # a bug: logged, never echoed to the client
            log('ERROR', 'hafs_failed', error=type(exc).__name__, detail=str(exc)[:300], path=path[:200])
            return error(500, 'internal_error', 'Internal error.')

    def _run(self, model: str, cycle: str, storm: str) -> Response:
        body = self.service.run_detail(model, cycle, storm)
        settled = self.service.run_is_settled(model, cycle, storm)
        return Response(200, body, {'Cache-Control': CACHE_RUN_SETTLED if settled else CACHE_RUN_LIVE})

    def _frame(self, model: str, cycle: str, storm: str, domain: str, field: str, hour: str) -> Response:
        started = time.monotonic()
        png, meta = self.service.frame(model, cycle, storm, domain, field, int(hour))
        self.counters['frames'] += 1
        log('INFO', 'frame', {'hafs_frame_ms': round((time.monotonic() - started) * 1000), 'hafs_png_bytes': len(png)})
        return Response(200, png, {
            'Content-Type': 'image/png',
            'Cache-Control': CACHE_FRAME,
            # The corners, so a client holding only the PNG can still place it.
            'X-Hafs-Bounds': ','.join(str(v) for v in meta['bounds']),
            'X-Hafs-Valid-Time': meta['validTime'],
            'Access-Control-Expose-Headers': 'X-Hafs-Bounds, X-Hafs-Valid-Time',
        })


_app: App | None = None


def app() -> App:
    """One App per Lambda container, so warm invocations reuse its caches."""
    global _app
    if _app is None:
        _app = App(HafsService(HafsSource(), log=lambda sev, msg, **f: log(sev, msg, **f),
                               workers=int(os.environ.get('HAFS_WORKERS', '16'))))
    return _app


def _client(event: dict) -> str:
    headers = event.get('headers') or {}
    forwarded = headers.get('x-forwarded-for', '')
    if forwarded:
        return forwarded.split(',')[0].strip()[:64]
    return ((event.get('requestContext') or {}).get('http') or {}).get('sourceIp', 'unknown')


def handler(event, context):
    """Lambda Function URL (payload format 2.0) → Response."""
    http = (event.get('requestContext') or {}).get('http') or {}
    headers = event.get('headers') or {}
    resp = app().handle(http.get('method', 'GET'), event.get('rawPath') or '/', event.get('rawQueryString') or '',
                        _client(event), headers.get('origin'))
    body = resp.payload()
    out = {'statusCode': resp.status, 'headers': {'Content-Type': resp.content_type, **resp.headers}}
    if isinstance(resp.body, bytes):
        out['body'] = base64.b64encode(body).decode()
        out['isBase64Encoded'] = True
    else:
        out['body'] = body.decode()
    return out
