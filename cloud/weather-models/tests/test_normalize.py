"""Unit normalization, wind, and precipitation semantics."""

import numpy as np
import pytest
from conftest import HOUR, LA, T12Z

import normalize
from providers import GFSProvider, HRRRProvider


@pytest.mark.parametrize(('u', 'v', 'direction'), [
    (0.0, -5.0, 0),  # blowing south = from the north
    (-5.0, 0.0, 90),  # from the east
    (0.0, 5.0, 180),  # from the south
    (5.0, 0.0, 270),  # from the west
    (3.0, 3.0, 225),  # from the south-west
])
def test_wind_direction_is_meteorological(u, v, direction):
    speed, d = normalize.wind_speed_direction(np.array([u]), np.array([v]))
    assert d[0] % 360 == pytest.approx(direction)
    assert speed[0] == pytest.approx(np.hypot(u, v))


def test_calm_wind_has_no_direction():
    speed, d = normalize.wind_speed_direction(np.array([0.0, 0.05]), np.array([0.0, 0.0]))
    assert np.isnan(d).all()
    assert list(speed) == [0.0, 0.05]


def test_unit_conversions():
    assert normalize.convert(np.array([0.0, 100.0]), 'temperature', 'us').tolist() == [32.0, 212.0]
    assert normalize.convert(np.array([10.0]), 'speed', 'us')[0] == pytest.approx(22.369, abs=1e-3)
    assert normalize.convert(np.array([25.4]), 'depth', 'us')[0] == pytest.approx(1.0)
    assert normalize.convert(np.array([25.4]), 'rate', 'us')[0] == pytest.approx(1.0)
    assert normalize.convert(np.array([1013.25]), 'pressure', 'us')[0] == 1013.25
    assert normalize.convert(np.array([5.0]), 'speed', 'si')[0] == 5.0


def raw_series(n, **overrides):
    base = {
        'temperature_2m': np.full(n, 20.0),
        'relative_humidity_2m': np.full(n, 30.0),
        'wind_u_10m': np.full(n, 0.0),
        'wind_v_10m': np.full(n, -5.0),
        'wind_gust_surface': np.full(n, 9.0),
        'precipitation_surface': np.r_[np.nan, np.full(n - 1, 1.0 / 3600)],
        'pressure_surface': np.full(n, 95000.0),
    }
    base.update(overrides)
    return base


def test_precipitation_rate_and_amount_follow_each_step_length():
    provider = GFSProvider()
    leads = np.array([0, 1, 2, 3, 6, 9], dtype='float64') * HOUR  # GFS: hourly, then 3-hourly
    entries = normalize.build_series(provider, provider.locate(*LA), T12Z, leads,
                                     raw_series(6), ['precipitationRate', 'precipitationAmount'], 'si', 6)
    assert [e['precipitationPeriodHours'] for e in entries] == [None, 1, 1, 1, 3, 3]
    assert [e['precipitationRate'] for e in entries] == [None, 1.0, 1.0, 1.0, 1.0, 1.0]  # mm/h, the step average
    assert [e['precipitationAmount'] for e in entries] == [None, 1.0, 1.0, 1.0, 3.0, 3.0]  # mm in that step only


def test_forecast_hour_and_valid_time():
    provider = HRRRProvider()
    leads = np.array([0, 1, 2], dtype='float64') * HOUR
    entries = normalize.build_series(provider, provider.locate(38.5, -97.5), T12Z, leads, raw_series(3),
                                     ['temperature'], 'us', 3)
    assert [(e['forecastHour'], e['validTime']) for e in entries] == [
        (0, '2026-10-01T12:00:00Z'), (1, '2026-10-01T13:00:00Z'), (2, '2026-10-01T14:00:00Z')]
    assert entries[0]['temperature'] == 68.0
    assert 'precipitationPeriodHours' not in entries[0]


def test_missing_values_are_null_never_filled():
    provider = HRRRProvider()
    leads = np.array([0, 1, 2], dtype='float64') * HOUR
    raw = raw_series(3, relative_humidity_2m=np.array([30.0, np.nan, 32.0]))
    entries = normalize.build_series(provider, provider.locate(38.5, -97.5), T12Z, leads, raw,
                                     ['relativeHumidity'], 'us', 3)
    assert [e['relativeHumidity'] for e in entries] == [30, None, 32]


def test_series_is_truncated_to_lead_count():
    provider = HRRRProvider()
    leads = np.array([0, 1, 2, 3], dtype='float64') * HOUR
    entries = normalize.build_series(provider, provider.locate(38.5, -97.5), T12Z, leads, raw_series(4),
                                     ['temperature'], 'us', 2)
    assert len(entries) == 2


def test_no_negative_zero():
    assert normalize.to_json_number(-0.00001, 1) == 0.0
    assert str(normalize.to_json_number(-0.00001, 1)) == '0.0'
    assert normalize.to_json_number(float('nan'), 1) is None


def test_units_block_matches_unit_system():
    assert normalize.units_block(['temperature', 'windSpeed', 'precipitationAmount'], 'us') == {
        'temperature': '°F', 'windSpeed': 'mph', 'precipitationAmount': 'in'}
    assert normalize.units_block(['temperature', 'windSpeed', 'precipitationAmount'], 'si') == {
        'temperature': '°C', 'windSpeed': 'm/s', 'precipitationAmount': 'mm'}
