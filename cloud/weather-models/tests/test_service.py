"""Run selection, staleness, model selection and caching."""

import pytest
from conftest import (
    HONOLULU,
    HONOLULU_GFS_CELL,
    HOUR,
    LA,
    LA_GFS_CELL,
    LA_HRRR_CELL,
    T12Z,
    FixedClock,
    build_dataset,
    constant_cell,
)

from providers import GFSProvider, HRRRProvider, NoDataError, OutOfDomainError
from service import ForecastRequest, ForecastService, InvalidRequestError, RequestStats, StaleDataError

RUNS = [T12Z - 12 * HOUR, T12Z - 6 * HOUR, T12Z]
HRRR_LEADS = list(range(0, 7))  # a short 0-6 h axis is enough to exercise the logic
GFS_LEADS = [0, 1, 2, 3, 6, 9, 12]


def make_service(hrrr_cell=None, gfs_cells=None, now=T12Z + 2 * HOUR, hrrr_runs=RUNS, hrrr_storage=None):
    hrrr_storage = hrrr_storage or build_dataset(
        'hrrr', init_times=hrrr_runs, lead_hours=HRRR_LEADS,
        cells={LA_HRRR_CELL: hrrr_cell or constant_cell()})
    gfs_storage = build_dataset('gfs', init_times=RUNS, lead_hours=GFS_LEADS,
                                cells=gfs_cells or {LA_GFS_CELL: constant_cell(), HONOLULU_GFS_CELL: constant_cell()})
    clock = FixedClock(now)
    providers = {'hrrr': HRRRProvider(hrrr_storage), 'gfs': GFSProvider(gfs_storage)}
    return ForecastService(providers, clock=clock), clock


def forecast(service, **kw):
    kw.setdefault('lat', LA[0])
    kw.setdefault('lon', LA[1])
    stats = RequestStats()
    return service.forecast(ForecastRequest(**kw), stats), stats


class TestRunSelection:
    def test_uses_the_newest_complete_run(self):
        service, _ = make_service()
        body, stats = forecast(service, model='hrrr')
        assert body['run']['runTime'] == '2026-10-01T12:00:00Z'
        assert body['run']['selection'] == 'latest'
        assert body['run']['complete'] is True
        assert body['run']['forecastHoursAvailable'] == 6
        assert body['run']['newestRunTime'] == '2026-10-01T12:00:00Z'
        assert len(body['forecast']) == 7
        assert stats.selection == 'latest'

    def test_partial_newest_run_is_used_when_it_covers_the_request(self):
        service, _ = make_service(constant_cell(missing_after={2: 4}))
        body, _ = forecast(service, model='hrrr', hours=3)
        assert body['run']['runTime'] == '2026-10-01T12:00:00Z'
        assert body['run']['complete'] is False
        assert body['run']['forecastHoursAvailable'] == 3
        assert body['run']['selection'] == 'latest'
        assert [e['forecastHour'] for e in body['forecast']] == [0, 1, 2, 3]

    def test_falls_back_to_previous_run_when_newest_is_incomplete(self):
        service, _ = make_service(constant_cell(missing_after={2: 4}))
        body, _ = forecast(service, model='hrrr', hours=6)
        assert body['run']['runTime'] == '2026-10-01T06:00:00Z'
        assert body['run']['selection'] == 'newest-run-incomplete'
        assert body['run']['newestRunTime'] == '2026-10-01T12:00:00Z'
        assert body['run']['complete'] is True

    def test_newest_run_absent_at_this_cell(self):
        service, _ = make_service(constant_cell(missing_runs=(2,)))
        body, _ = forecast(service, model='hrrr')
        assert body['run']['runTime'] == '2026-10-01T06:00:00Z'
        assert body['run']['selection'] == 'newest-run-incomplete'

    def test_partial_runs_only(self):
        service, _ = make_service(constant_cell(missing_after={0: 2, 1: 3, 2: 1}))
        body, _ = forecast(service, model='hrrr', hours=6)
        assert body['run']['runTime'] == '2026-10-01T06:00:00Z'  # the most hours
        assert body['run']['selection'] == 'partial-run'
        assert body['run']['complete'] is False
        assert len(body['forecast']) == 3  # only what exists; nothing padded

    def test_no_data_anywhere(self):
        service, _ = make_service(constant_cell(missing_runs=(0, 1, 2)))
        with pytest.raises(NoDataError):
            forecast(service, model='hrrr')

    def test_forecast_range(self):
        service, _ = make_service()
        body, _ = forecast(service, model='gfs', hours=6)
        assert [e['forecastHour'] for e in body['forecast']] == [0, 1, 2, 3, 6]
        assert body['requestedHours'] == 6
        with pytest.raises(InvalidRequestError):
            forecast(service, model='hrrr', hours=49)
        with pytest.raises(InvalidRequestError):
            forecast(service, model='gfs', hours=385)


class TestFreshness:
    def test_fresh_run_reports_age(self):
        service, _ = make_service(now=T12Z + 2 * HOUR + 30 * 60)
        body, stats = forecast(service, model='hrrr')
        assert body['run']['ageMinutes'] == 150
        assert body['run']['stale'] is False
        assert body['retrievedAt'] == '2026-10-01T14:30:00Z'
        assert stats.stale is False

    def test_old_run_is_flagged_stale(self):
        service, _ = make_service(now=T12Z + 13 * HOUR)
        body, stats = forecast(service, model='hrrr')
        assert body['run']['stale'] is True
        assert stats.stale is True

    def test_too_old_run_is_refused(self):
        service, _ = make_service(now=T12Z + 25 * HOUR)
        with pytest.raises(StaleDataError):
            forecast(service, model='hrrr')


class TestModelSelection:
    def test_explicit_models_are_labelled_correctly(self):
        service, _ = make_service()
        hrrr, _ = forecast(service, model='hrrr')
        gfs, _ = forecast(service, model='gfs')
        assert hrrr['model']['name'] == 'HRRR' and hrrr['source']['dataset'] == 'noaa-hrrr-forecast-48-hour'
        assert gfs['model']['name'] == 'GFS' and gfs['source']['dataset'] == 'noaa-gfs-forecast'
        assert hrrr['modelSelection']['mode'] == 'explicit'

    def test_auto_prefers_hrrr_inside_conus_short_range(self):
        service, _ = make_service()
        body, _ = forecast(service, model='auto', hours=6)
        assert body['model']['id'] == 'hrrr'
        assert body['modelSelection']['requested'] == 'auto'

    def test_auto_uses_gfs_outside_conus(self):
        service, _ = make_service()
        body, _ = forecast(service, model='auto', lat=HONOLULU[0], lon=HONOLULU[1])
        assert body['model']['id'] == 'gfs'
        assert 'outside the HRRR domain' in body['modelSelection']['reason']

    def test_auto_uses_gfs_beyond_48_hours(self):
        service, _ = make_service()
        body, _ = forecast(service, model='auto', hours=72)
        assert body['model']['id'] == 'gfs'

    def test_auto_falls_back_to_gfs_and_says_so(self):
        service, _ = make_service(constant_cell(missing_runs=(0, 1, 2)))
        body, stats = forecast(service, model='auto', hours=6)
        assert body['model']['id'] == 'gfs'
        assert body['modelSelection']['fallbackFrom'] == 'hrrr'
        assert stats.fallback is True

    def test_explicit_hrrr_never_falls_back(self):
        service, _ = make_service(constant_cell(missing_runs=(0, 1, 2)))
        with pytest.raises(NoDataError):
            forecast(service, model='hrrr')

    def test_explicit_hrrr_outside_domain(self):
        service, _ = make_service()
        with pytest.raises(OutOfDomainError):
            forecast(service, model='hrrr', lat=HONOLULU[0], lon=HONOLULU[1])


class TestVariables:
    def test_hrrr_gusts_are_returned(self):
        service, _ = make_service()
        body, _ = forecast(service, model='hrrr', hours=1)
        entry = body['forecast'][1]
        assert entry['windGust'] == pytest.approx(20.1, abs=0.05)  # 9 m/s in mph
        assert entry['windSpeed'] == pytest.approx(11.2, abs=0.05)  # 5 m/s in mph
        assert body['unavailableVariables'] == []

    def test_gfs_gusts_are_unavailable_not_invented(self):
        service, _ = make_service()
        body, _ = forecast(service, model='gfs', hours=1)
        assert body['unavailableVariables'] == ['windGust']
        assert all('windGust' not in e for e in body['forecast'])
        assert 'windGust' not in body['units']

    def test_requested_variables_only(self):
        service, _ = make_service()
        body, _ = forecast(service, model='hrrr', hours=1, variables=('temperature', 'dewPoint'), units='si')
        assert set(body['forecast'][0]) == {'validTime', 'forecastHour', 'temperature', 'dewPoint'}
        assert body['forecast'][0]['temperature'] == 20.0
        assert body['units'] == {'temperature': '°C', 'dewPoint': '°C'}

    def test_reflectivity_is_hrrr_only(self):
        service, _ = make_service()
        hrrr, _ = forecast(service, model='hrrr', hours=1, variables=('compositeReflectivity',))
        assert hrrr['forecast'][1]['compositeReflectivity'] == 35
        assert hrrr['units'] == {'compositeReflectivity': 'dBZ'}
        assert 'not radar observations' in hrrr['variables']['compositeReflectivity']['description']
        gfs, _ = forecast(service, model='gfs', hours=1, variables=('temperature', 'compositeReflectivity'))
        assert gfs['unavailableVariables'] == ['compositeReflectivity']
        assert all('compositeReflectivity' not in e for e in gfs['forecast'])

    def test_only_unavailable_variables_requested(self):
        service, _ = make_service()
        with pytest.raises(InvalidRequestError, match='none of the requested'):
            forecast(service, model='gfs', variables=('windGust',))

    def test_response_identifies_source_and_grid_point(self):
        service, _ = make_service()
        body, _ = forecast(service, model='hrrr')
        assert body['kind'] == 'model-forecast'
        assert 'not observed' in body['notice']
        assert body['source']['uri'] == 's3://dynamical-noaa-hrrr/noaa-hrrr-forecast-48-hour/v0.1.0.icechunk'
        assert body['source']['region'] == 'us-west-2'
        assert body['gridPoint']['distanceKm'] < 3
        assert body['location'] == {'lat': LA[0], 'lon': LA[1]}


class TestCaching:
    def test_repeat_requests_are_served_from_the_point_cache(self, monkeypatch):
        service, _ = make_service()
        provider = service.providers['hrrr']
        calls = []
        original = provider.read_point
        monkeypatch.setattr(provider, 'read_point', lambda *a: calls.append(a[2]) or original(*a))

        _, first = forecast(service, model='hrrr')
        assert first.cache_misses > 0
        reads = len(calls)

        _, second = forecast(service, model='hrrr', units='si', variables=('temperature', 'windSpeed'))
        assert len(calls) == reads, 'same cell + run: no further dataset reads'
        assert second.cache_misses == 0

    def test_incomplete_runs_expire_quickly(self):
        from cache import PointCache

        assert PointCache.PARTIAL_RUN_TTL_S <= 60 < PointCache.COMPLETE_RUN_TTL_S
