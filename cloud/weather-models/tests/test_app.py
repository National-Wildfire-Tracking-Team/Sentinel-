"""HTTP contract: parameters, status codes, cache headers, metrics."""

import io
import json
from contextlib import redirect_stdout

import pytest
from conftest import HONOLULU, HOUR, LA, LA_HRRR_CELL, T12Z, build_dataset, constant_cell
from test_service import make_service

from app import App
from providers import DatasetError


def app_for(**kw):
    service, clock = make_service(**kw)
    return App(service, rate_limit_per_minute=1000), clock


def get(app, target):
    out = io.StringIO()
    with redirect_stdout(out):
        resp = app.handle('GET', target, client='test')
    lines = [json.loads(line) for line in out.getvalue().splitlines() if line.strip()]
    return resp, lines


class TestValidRequests:
    def test_forecast_ok(self):
        app, _ = app_for()
        resp, logs = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&model=hrrr')
        assert resp.status == 200
        assert resp.body['model']['name'] == 'HRRR'
        assert resp.headers['Cache-Control'] == 'public, max-age=0, s-maxage=600, must-revalidate'
        assert resp.headers['X-Sentinel-Cache'] == 'miss'
        assert logs[-1]['status'] == 200 and logs[-1]['hrrr_requests'] == 1

    def test_missing_model_defaults_to_auto(self):
        app, _ = app_for()
        resp, _ = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&hours=6')
        assert resp.status == 200
        assert resp.body['modelSelection']['requested'] == 'auto'
        assert resp.body['model']['id'] == 'hrrr'

    def test_parameter_aliases(self):
        app, _ = app_for()
        resp, _ = get(app, f'/v1/forecast?latitude={LA[0]}&lng={LA[1]}&model=GFS&forecastHours=3')
        assert resp.status == 200
        assert resp.body['model']['id'] == 'gfs' and resp.body['requestedHours'] == 3

    def test_provisional_answers_are_cached_briefly(self):
        app, _ = app_for(hrrr_cell=constant_cell(missing_after={2: 4}))
        resp, _ = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&model=hrrr&hours=6')
        assert resp.body['run']['selection'] == 'newest-run-incomplete'
        assert 's-maxage=120' in resp.headers['Cache-Control']

    def test_stale_data_is_flagged_counted_and_cached_briefly(self):
        app, _ = app_for(now=T12Z + 13 * HOUR)
        resp, logs = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&model=hrrr')
        assert resp.status == 200 and resp.body['run']['stale'] is True
        assert 's-maxage=120' in resp.headers['Cache-Control']
        assert logs[-1]['stale_data_events'] == 1 and logs[-1]['severity'] == 'WARNING'


class TestInvalidRequests:
    @pytest.mark.parametrize('query', [
        'lat=91&lon=0', 'lat=-90.5&lon=0', 'lat=0&lon=181', 'lat=abc&lon=0', 'lat=nan&lon=0', 'lat=inf&lon=0',
        'lat=&lon=0',
    ])
    def test_invalid_coordinates(self, query):
        app, _ = app_for()
        resp, _ = get(app, f'/v1/forecast?{query}')
        assert resp.status == 400
        assert resp.body['error']['code'] == 'invalid_parameter'
        assert resp.headers['Cache-Control'] == 'no-store'

    @pytest.mark.parametrize('query', ['lon=0', 'lat=0', ''])
    def test_missing_coordinates(self, query):
        app, _ = app_for()
        resp, _ = get(app, f'/v1/forecast?{query}')
        assert resp.status == 400
        assert 'required' in resp.body['error']['message']

    @pytest.mark.parametrize('model', ['ecmwf', 'nam', 'HRRR3', 'hrrr,gfs'])
    def test_invalid_model(self, model):
        app, _ = app_for()
        resp, _ = get(app, f'/v1/forecast?lat=1&lon=1&model={model}')
        assert resp.status == 400
        assert 'model must be one of' in resp.body['error']['message']

    def test_empty_model_means_auto(self):
        app, _ = app_for()
        resp, _ = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&model=&hours=6')
        assert resp.status == 200 and resp.body['modelSelection']['requested'] == 'auto'

    @pytest.mark.parametrize('query', ['hours=-1', 'hours=1.5', 'hours=abc', 'hours=999', 'model=hrrr&hours=49'])
    def test_forecast_range(self, query):
        app, _ = app_for()
        resp, _ = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&{query}')
        assert resp.status == 400

    def test_unknown_variable_and_units(self):
        app, _ = app_for()
        assert get(app, '/v1/forecast?lat=1&lon=1&variables=temperature,smoke')[0].status == 400
        assert get(app, '/v1/forecast?lat=1&lon=1&units=kelvin')[0].status == 400

    def test_outside_hrrr_domain(self):
        app, _ = app_for()
        resp, _ = get(app, f'/v1/forecast?lat={HONOLULU[0]}&lon={HONOLULU[1]}&model=hrrr')
        assert resp.status == 422
        assert resp.body['error']['code'] == 'out_of_domain'


class TestUnavailableData:
    def test_no_data_is_503_and_never_cached(self):
        app, _ = app_for(hrrr_cell=constant_cell(missing_runs=(0, 1, 2)))
        resp, _ = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&model=hrrr')
        assert resp.status == 503
        assert resp.body['error']['code'] == 'no_data'
        assert resp.headers['Cache-Control'] == 'no-store'
        assert 'forecast' not in resp.body

    def test_too_old_is_503(self):
        app, _ = app_for(now=T12Z + 30 * HOUR)
        resp, logs = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&model=hrrr')
        assert resp.status == 503 and resp.body['error']['code'] == 'stale_data'
        assert logs[-1]['stale_data_events'] == 1

    def test_s3_failure_is_502_and_counted(self, monkeypatch):
        app, _ = app_for()
        provider = app.service.providers['gfs']

        def boom(*_):
            raise DatasetError('GFS temperature_2m could not be read: ClientError')

        monkeypatch.setattr(provider, 'read_point', boom)
        resp, logs = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&model=gfs')
        assert resp.status == 502
        assert resp.body['error']['code'] == 'dataset_error'
        assert resp.headers['Cache-Control'] == 'no-store'
        assert logs[-1]['dataset_errors'] == 1 and logs[-1]['severity'] == 'ERROR'
        assert app.counters['datasetErrors'] == 1

    def test_unexpected_exception_is_500_without_partial_data(self, monkeypatch):
        app, _ = app_for()
        monkeypatch.setattr(app.service, 'forecast', lambda *a: 1 / 0)
        resp, logs = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}')
        assert resp.status == 500 and set(resp.body) == {'schemaVersion', 'error'}
        assert any(line['message'] == 'forecast_exception' for line in logs)


class TestRoutes:
    def test_models_catalog(self):
        app, _ = app_for()
        resp, _ = get(app, '/v1/models')
        assert resp.status == 200
        models = {m['id']: m for m in resp.body['models']}
        assert set(models) == {'hrrr', 'gfs'}
        assert models['hrrr']['newestRunTime'] == '2026-10-01T12:00:00Z'
        assert models['hrrr']['coverage']['type'] == 'Polygon'
        assert models['gfs']['coverage'] is None
        assert 'windGust' not in models['gfs']['variables']
        assert 's-maxage=300' in resp.headers['Cache-Control']

    def test_catalog_degrades_per_model(self):
        broken = build_dataset('hrrr', init_times=[T12Z], lead_hours=[0], grid_override={'x0': 0.0},
                               cells={LA_HRRR_CELL: constant_cell()})
        app, _ = app_for(hrrr_storage=broken)
        resp, _ = get(app, '/v1/models')
        models = {m['id']: m for m in resp.body['models']}
        assert models['hrrr']['status'] == 'unavailable' and models['gfs']['status'] == 'available'
        assert resp.headers['Cache-Control'] == 'no-store'

    def test_health_never_reads_the_dataset(self, monkeypatch):
        app, _ = app_for()
        for provider in app.service.providers.values():
            monkeypatch.setattr(provider, '_open', lambda: pytest.fail('health must not touch S3'))
        resp, _ = get(app, '/health')
        assert resp.status == 200 and resp.body['ok'] is True

    def test_not_found_and_method(self):
        app, _ = app_for()
        assert get(app, '/v1/nope')[0].status == 404
        assert app.handle('POST', '/v1/forecast?lat=1&lon=1').status == 405
        assert app.handle('OPTIONS', '/v1/forecast').status == 204

    def test_rate_limit(self):
        service, _ = make_service()
        app = App(service, rate_limit_per_minute=2)
        statuses = [app.handle('GET', '/v1/forecast?lat=95&lon=0', client='c').status for _ in range(3)]
        assert statuses == [400, 400, 429]


class TestLogging:
    def test_request_log_is_emf_and_omits_location(self):
        app, _ = app_for()
        _, logs = get(app, f'/v1/forecast?lat={LA[0]}&lon={LA[1]}&model=hrrr')
        line = logs[-1]
        emf = line['_aws']['CloudWatchMetrics'][0]
        assert emf['Namespace'] == 'Sentinel/WeatherModels'
        names = {m['Name'] for m in emf['Metrics']}
        assert {'weather_requests', 'hrrr_requests', 'gfs_requests', 'cache_hits', 'cache_misses',
                'model_data_latency', 'dataset_errors', 'stale_data_events'} <= names
        text = json.dumps(line)
        assert str(LA[0]) not in text and str(LA[1]) not in text
        assert 'lat' not in line and 'lon' not in line


class TestLocalFields:
    def test_serves_files_inside_the_build_dir_only(self, tmp_path, monkeypatch):
        import app as app_module

        frames = tmp_path / 'weather-models' / 'fields' / 'v1'
        frames.mkdir(parents=True)
        (frames / 'manifest.json').write_text('{}')
        (tmp_path / 'secret.txt').write_text('nope')
        monkeypatch.setattr(app_module, 'FIELDS_DIR', str(tmp_path))
        a, _ = app_for()
        ok = a.handle('GET', '/fields/v1/manifest.json')
        assert ok.status == 200 and ok.raw == b'{}' and ok.headers['Cache-Control'] == 'no-store'
        assert a.handle('GET', '/fields/../../secret.txt').status == 404
        assert a.handle('GET', '/fields/v1/%2e%2e/%2e%2e/secret.txt').status == 404

    def test_disabled_without_fields_dir(self, monkeypatch):
        import app as app_module

        monkeypatch.setattr(app_module, 'FIELDS_DIR', None)
        a, _ = app_for()
        assert a.handle('GET', '/fields/v1/manifest.json').status == 404
