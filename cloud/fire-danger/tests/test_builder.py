"""A run end to end against the recorded FEMS responses, into a local store."""

import datetime as dt
import json

import builder
from store import LocalStore

NOW = dt.datetime(2026, 10, 20, 15, 0, tzinfo=dt.timezone.utc).timestamp()


def run(tmp_path, source, now=NOW, wfpi_source=None):
    from conftest import FakeWfpi
    store = LocalStore(str(tmp_path))
    b = builder.FireDangerBuilder(store, source=source, clock=lambda: now, sleep=lambda s: None, wfpi_source=wfpi_source or FakeWfpi())
    return b.run(), store


def read(tmp_path, key):
    return json.loads((tmp_path / key).read_text())


def test_publishes_stations_details_and_manifest_last(tmp_path, fake_fems):
    summary, store = run(tmp_path, fake_fems())
    assert store.writes[-1] == builder.MANIFEST_KEY
    m = read(tmp_path, builder.MANIFEST_KEY)
    f = m['sources']['fems']
    assert f['status'] == 'ok' and f['stale'] is False
    assert f['stations'] == 3 and f['stationsWithCurrentData'] == 3
    assert f['latestObservedDate'] == '2026-10-19' and f['forecastThrough'] == '2026-10-26'
    assert f['retrievedAt'] == '2026-10-20T15:00:00Z'
    stations = read(tmp_path, builder.KEY_PREFIX + m['products']['stations']['path'])
    alpine = next(x for x in stations['features'] if x['properties']['id'] == 20401)
    assert alpine['geometry']['coordinates'] == [-109.11161, 33.84272]
    p = alpine['properties']
    # ALPINE 2026-10-19 observed values, and the first forecast day, from the recorded CSV
    assert p['observedDate'] == '2026-10-19' and p['erc'] == 19.28 and p['fm100'] == 16.02
    assert p['forecastDates'][0] == '2026-10-20' and p['forecastErc'][0] == 17.34
    detail = read(tmp_path, builder.KEY_PREFIX + m['products']['stations']['detailPath'].replace('{id}', '20401'))
    assert len(detail['observed']) == 15 and len(detail['forecast']) == 7


def test_requests_two_weeks_back_and_the_forecast_week(tmp_path, fake_fems):
    src = fake_fems()
    run(tmp_path, src)
    ids, start, end = src.calls[0]
    assert sorted(ids) == [20401, 21503, 40423]
    assert start == dt.date(2026, 10, 6) and end == dt.date(2026, 10, 28)


def test_station_without_rows_is_listed_without_values(tmp_path, fake_fems):
    meta = fake_fems().metadata + [{'station_id': 999, 'station_name': 'NEW', 'latitude': 40, 'longitude': -110, 'state': 'UT', 'station_status': 'A'}]
    _, _ = run(tmp_path, fake_fems(metadata=meta))
    m = read(tmp_path, builder.MANIFEST_KEY)
    stations = read(tmp_path, builder.KEY_PREFIX + m['products']['stations']['path'])
    new = next(x for x in stations['features'] if x['properties']['id'] == 999)['properties']
    assert new['observedDate'] is None and new['erc'] is None and new['forecastErc'] == []
    assert m['sources']['fems']['stationsWithCurrentData'] == 3


def test_failure_keeps_last_good_run_and_says_so(tmp_path, fake_fems):
    run(tmp_path, fake_fems())
    first = read(tmp_path, builder.MANIFEST_KEY)
    later = NOW + 3 * 3600
    run(tmp_path, fake_fems(fail_stations=True), now=later)
    m = read(tmp_path, builder.MANIFEST_KEY)
    f = m['sources']['fems']
    assert f['status'] == 'error' and 'station list' in f['error']
    assert f['lastSuccessAt'] == '2026-10-20T15:00:00Z' and f['attemptedAt'] == '2026-10-20T18:00:00Z'
    assert m['products'] == first['products']
    assert f['latestObservedDate'] == '2026-10-19'


def test_a_failed_batch_is_retried_once(tmp_path, fake_fems):
    src = fake_fems(fail_batches={0})
    run(tmp_path, src)
    assert len(src.calls) == 2
    assert read(tmp_path, builder.MANIFEST_KEY)['sources']['fems']['status'] == 'ok'


def test_too_many_failed_batches_is_an_error_not_a_thin_map(tmp_path, fake_fems):
    _, store = run(tmp_path, fake_fems(fail_batches={0, 1}))
    f = read(tmp_path, builder.MANIFEST_KEY)['sources']['fems']
    assert f['status'] == 'error' and '1 of 1' in f['error']
    assert store.writes == [builder.MANIFEST_KEY]


def test_unchanged_data_writes_only_the_manifest(tmp_path, fake_fems):
    run(tmp_path, fake_fems())
    first = read(tmp_path, builder.MANIFEST_KEY)
    _, store = run(tmp_path, fake_fems(), now=NOW + 3600)
    assert store.writes == [builder.MANIFEST_KEY]
    m = read(tmp_path, builder.MANIFEST_KEY)
    assert m['products'] == first['products']
    assert m['sources']['fems']['retrievedAt'] == '2026-10-20T16:00:00Z'


def test_old_observations_are_flagged_stale(tmp_path, fake_fems):
    run(tmp_path, fake_fems(), now=NOW + 5 * 86400)
    assert read(tmp_path, builder.MANIFEST_KEY)['sources']['fems']['stale'] is True


def test_publishes_wfpi_valid_dates(tmp_path, fake_fems):
    run(tmp_path, fake_fems())
    w = read(tmp_path, builder.MANIFEST_KEY)['sources']['wfpi']
    assert w['status'] == 'ok' and w['stale'] is False
    assert w['validDates'] == ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']


def test_wfpi_failure_keeps_last_dates_marked_error(tmp_path, fake_fems, fake_wfpi):
    run(tmp_path, fake_fems())
    run(tmp_path, fake_fems(), now=NOW + 3600, wfpi_source=fake_wfpi(fail=True))
    w = read(tmp_path, builder.MANIFEST_KEY)['sources']['wfpi']
    assert w['status'] == 'error' and w['validDates'][0] == '2026-10-19' and w['lastSuccessAt'] == '2026-10-20T15:00:00Z'


def test_wfpi_layers_out_of_step_publish_no_dates(tmp_path, fake_fems, fake_wfpi):
    run(tmp_path, fake_fems(), wfpi_source=fake_wfpi(day7='2026-10-24'))
    w = read(tmp_path, builder.MANIFEST_KEY)['sources']['wfpi']
    assert w['status'] == 'error' and 'out of step' in w['error'] and 'validDates' not in w


def test_wfpi_old_run_is_stale(tmp_path, fake_fems, fake_wfpi):
    run(tmp_path, fake_fems(), wfpi_source=fake_wfpi(day1='2026-10-10', day7='2026-10-16'))
    assert read(tmp_path, builder.MANIFEST_KEY)['sources']['wfpi']['stale'] is True


def test_fems_failure_does_not_block_wfpi(tmp_path, fake_fems):
    run(tmp_path, fake_fems(fail_stations=True))
    m = read(tmp_path, builder.MANIFEST_KEY)
    assert m['sources']['fems']['status'] == 'error' and m['sources']['wfpi']['status'] == 'ok'
