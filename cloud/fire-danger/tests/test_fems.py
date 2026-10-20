"""Parsing FEMS responses as recorded from the live service."""

import datetime as dt

import fems
from conftest import fixture_text


def test_parse_summary_splits_observed_and_forecast_in_date_order():
    data = fems.parse_summary(fixture_text('fems_nfdr_daily_summary.csv'))
    assert set(data) == {20401, 21503, 40423}
    alpine = data[20401]
    assert [d['date'] for d in alpine['observed']][:2] == ['2026-10-05', '2026-10-06']
    assert alpine['observed'][-1]['date'] == '2026-10-19'
    assert len(alpine['forecast']) == 7
    assert alpine['forecast'][0]['date'] == '2026-10-20'


def test_parse_summary_keeps_fems_values_exactly():
    # From the recorded CSV: ALPINE 2026-10-05, O, Y: 1hr 9.52, ERC 20.68, BI 15.8, KBDI 11, herb 193.54
    first = fems.parse_summary(fixture_text('fems_nfdr_daily_summary.csv'))[20401]['observed'][0]
    assert first == {
        'date': '2026-10-05', 'qa': '0', 'fm1': 9.52, 'fm10': 11.17, 'fm100': 16.52, 'fm1000': 20.4,
        'herbFM': 193.54, 'woodyFM': 164.07, 'kbdi': 11.0, 'gsi': 0.82, 'ic': 13.7, 'erc': 20.68, 'sc': 1.78, 'bi': 15.8,
    }


def test_padding_rows_and_blank_cells_are_not_values():
    text = ('"StationName","ObservationTime","NFDRType","FuelModel","1HrFM","ERC","BI","NFDRQAFlag","StationId"\n'
            '"X","2026-10-27","","","","","","","1"\n'
            '"X","2026-10-19","O","Y","","12.5","","0","1"\n')
    data = fems.parse_summary(text)
    day = data[1]['observed'][0]
    assert len(data[1]['observed']) == 1 and not data[1]['forecast']
    assert day['erc'] == 12.5
    assert day['fm1'] is None and day['bi'] is None and day['fm100'] is None


def test_active_stations_drops_inactive_and_bad_coordinates():
    meta = [
        {'station_id': 1, 'station_name': ' A ', 'latitude': 40.1, 'longitude': -120.2, 'state': 'CA', 'station_status': 'A'},
        {'station_id': 2, 'station_name': 'B', 'latitude': 40.1, 'longitude': -120.2, 'state': 'CA', 'station_status': 'D'},
        {'station_id': 3, 'station_name': 'C', 'latitude': None, 'longitude': -120.2, 'state': 'CA', 'station_status': 'A'},
        {'station_id': 4, 'station_name': 'D', 'latitude': 0, 'longitude': 0, 'state': 'CA', 'station_status': 'A'},
    ]
    assert fems.active_stations(meta) == [{'id': 1, 'name': 'A', 'state': 'CA', 'lat': 40.1, 'lon': -120.2}]


def test_trend_needs_both_ends():
    obs = [{'date': '2026-10-12', 'erc': 20.0}, {'date': '2026-10-15', 'erc': None}, {'date': '2026-10-19', 'erc': 26.5}]
    assert fems.trend(obs, 'erc') == 6.5
    assert fems.trend(obs[1:], 'erc') is None
    assert fems.trend([], 'erc') is None


def test_batches():
    assert [len(b) for b in fems.batches(list(range(120)))] == [50, 50, 20]


class _Res:
    def __init__(self, body):
        self.body = body

    def read(self, n):
        return self.body[:n]

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_daily_summary_request_and_validation():
    seen = {}

    def opener(req, timeout):
        seen['url'] = req.full_url
        seen['ua'] = req.get_header('User-agent')
        return _Res(b'"StationName","ObservationTime"\n')

    src = fems.FemsSource(opener=opener)
    src.daily_summary([1, 2], dt.date(2026, 10, 6), dt.date(2026, 10, 28))
    assert 'stationIds=1,2' in seen['url'] and 'fuelModels=Y' in seen['url'] and 'dataset=all' in seen['url']
    assert 'startDate=2026-10-06T00:00:00Z' in seen['url']
    assert seen['ua'].startswith('SentinelFireDanger/')

    bad = fems.FemsSource(opener=lambda req, timeout: _Res(b'<html>maintenance</html>'))
    try:
        bad.daily_summary([1], dt.date(2026, 10, 6), dt.date(2026, 10, 28))
    except fems.SourceError as exc:
        assert 'unexpected summary response' in str(exc)
    else:
        raise AssertionError('expected SourceError')
