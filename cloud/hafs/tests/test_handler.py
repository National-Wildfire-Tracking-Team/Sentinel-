import base64
import json

import pytest
from conftest import FakeSource
from test_service import CYCLE, NOW

import lambda_handler
from lambda_handler import CACHE_FRAME, CACHE_RUN_LIVE, App, handler
from service import HafsService

FRAME = f'/hafs/v1/frames/hfsa/{CYCLE}/09l/storm/mslp/3.png'


@pytest.fixture
def app():
    src = FakeSource({('hfsa', CYCLE): {'09l': [0, 3, 6]}}, names={'09l': 'isaias'})
    return App(HafsService(src, clock=lambda: NOW, workers=4, catalog_days=1), rate_limit_per_minute=5,
               allowed_origins=[])


def test_catalog_with_and_without_the_cloudfront_prefix(app):
    for path in ('/hafs/v1/catalog', '/v1/catalog'):
        r = app.handle('GET', path)
        assert r.status == 200 and r.json['kind'] == 'hafs-catalog'
        assert 's-maxage=60' in r.headers['Cache-Control']


def test_run_detail_route(app):
    r = app.handle('GET', f'/hafs/v1/runs/hfsa/{CYCLE}/09l')
    assert r.status == 200 and r.json['kind'] == 'hafs-run'
    assert r.headers['Cache-Control'] == CACHE_RUN_LIVE


def test_frame_route_returns_an_immutable_png(app):
    r = app.handle('GET', FRAME)
    assert r.status == 200 and r.content_type == 'image/png'
    assert r.body[:8] == b'\x89PNG\r\n\x1a\n'
    assert r.headers['Cache-Control'] == CACHE_FRAME
    assert len(r.headers['X-Hafs-Bounds'].split(',')) == 4
    assert r.headers['X-Hafs-Valid-Time'] == '2026-10-08T09:00:00Z'


@pytest.mark.parametrize('path', [
    '/hafs/v1/frames/hfsa/2026100806/09l/storm/mslp/3',  # no .png
    '/hafs/v1/frames/hfsa/2026100806/09l/../../etc/passwd/3.png',
    '/hafs/v1/frames/hfsa/2026100806/09l/storm/mslp/1234.png',
    '/hafs/v1/runs/hfsa/2026100806/09L',
    '/hafs/v1/runs/hfsa/26100806/09l',
    '/hafs/v1/runs/HFSA/2026100806/09l',
    '/hafs/v2/catalog',
    '/hafs-other/v1/catalog',
    '/',
])
def test_unknown_or_malformed_paths_are_404(app, path):
    r = app.handle('GET', path)
    assert r.status == 404 and r.json['error']['code'] == 'not_found'
    assert r.headers['Cache-Control'] == 'no-store'


def test_service_errors_keep_their_status(app):
    r = app.handle('GET', f'/hafs/v1/frames/hfsa/{CYCLE}/09l/storm/mslp/9.png')
    assert r.status == 404 and r.json['error']['code'] == 'hour_unavailable'
    assert app.handle('GET', f'/hafs/v1/runs/hfsa/2026100807/09l').status == 400


def test_query_strings_are_refused(app):
    r = app.handle('GET', '/hafs/v1/catalog', 'cachebust=1')
    assert r.status == 400


def test_only_get_head_and_options(app):
    assert app.handle('POST', '/hafs/v1/catalog').status == 405
    assert app.handle('OPTIONS', FRAME).status == 204
    head = app.handle('HEAD', '/hafs/v1/catalog')
    assert head.status == 200 and head.body is None and head.headers['Content-Type'] == 'application/json'


def test_upstream_failure_is_502_without_details(app):
    app.service.source.fail.add('range')
    r = app.handle('GET', FRAME)
    assert r.status == 502 and r.json['error']['code'] == 'upstream_unavailable'
    assert '503' not in json.dumps(r.json)
    assert app.counters['upstreamErrors'] == 1


def test_bugs_are_500_and_never_echoed(app, monkeypatch):
    monkeypatch.setattr(app.service, 'catalog', lambda: (_ for _ in ()).throw(KeyError('secret-ish detail')))
    r = app.handle('GET', '/hafs/v1/catalog')
    assert r.status == 500 and 'secret' not in json.dumps(r.json)


def test_rate_limit_applies_to_uncached_work_per_client(app):
    for _ in range(5):
        assert app.handle('GET', f'/hafs/v1/runs/hfsa/{CYCLE}/09l', client='a').status == 200
    r = app.handle('GET', f'/hafs/v1/runs/hfsa/{CYCLE}/09l', client='a')
    assert r.status == 429 and r.headers['Retry-After'] == '60'
    assert app.handle('GET', f'/hafs/v1/runs/hfsa/{CYCLE}/09l', client='b').status == 200


def test_cors_allowlist(app):
    assert app.handle('GET', '/health').headers['Access-Control-Allow-Origin'] == '*'
    app.allowed_origins = ['https://app.example.org']
    ok = app.handle('GET', '/health', origin='https://app.example.org')
    assert ok.headers['Access-Control-Allow-Origin'] == 'https://app.example.org' and ok.headers['Vary'] == 'Origin'
    other = app.handle('GET', '/health', origin='https://evil.example')
    assert 'Access-Control-Allow-Origin' not in other.headers


def test_health_never_reads_noaa(app):
    r = app.handle('GET', '/hafs/health')
    assert r.status == 200 and r.json['ok'] is True
    assert app.service.source.reads == []


def test_lambda_event_round_trip(app, monkeypatch):
    monkeypatch.setattr(lambda_handler, '_app', app)
    event = {
        'rawPath': FRAME, 'rawQueryString': '',
        'headers': {'x-forwarded-for': '203.0.113.9, 130.176.0.1', 'origin': 'https://x.example'},
        'requestContext': {'http': {'method': 'GET', 'sourceIp': '130.176.0.1'}},
    }
    out = handler(event, None)
    assert out['statusCode'] == 200 and out['isBase64Encoded'] is True
    assert out['headers']['Content-Type'] == 'image/png'
    assert base64.b64decode(out['body'])[:4] == b'\x89PNG'
    assert lambda_handler._client(event) == '203.0.113.9'

    event['rawPath'] = '/hafs/v1/catalog'
    out = handler(event, None)
    assert out['statusCode'] == 200 and 'isBase64Encoded' not in out
    assert json.loads(out['body'])['kind'] == 'hafs-catalog'
