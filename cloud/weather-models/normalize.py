"""
normalize.py
Turns raw model arrays into Sentinel's normalized variables and units.

Every value the API returns is defined here: what it measures, at what
height, over what time window, and in what unit. Values are only ever
converted from the model's own fields. A variable the model doesn't provide
is reported as unavailable, never estimated (no derived gusts, no dew point
computed for a model that doesn't carry one), and a missing grid value is
returned as null, never interpolated.

Precipitation semantics (both models, per the dataset's own metadata):
`precipitation_surface` is the *average rate since the previous forecast
step*. So at each valid time:
  precipitationRate   = that average, per hour
  precipitationAmount = rate × the step length = the total that fell in the
                        window (validTime - precipitationPeriodHours, validTime]
The step is 1 h for HRRR and for GFS to 120 h, then 3 h for GFS — each entry
carries its own precipitationPeriodHours so windows are never mixed. Lead
hour 0 has no preceding step, so both are null there.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

MS_TO_MPH = 2.2369362920544
MM_PER_IN = 25.4


@dataclass(frozen=True)
class Variable:
    label: str
    level: str
    time_semantics: str  # 'instant' | 'period-average' | 'period-total'
    quantity: str  # key into UNIT_SYSTEMS
    decimals: int
    description: str


VARIABLES: dict[str, Variable] = {
    'temperature': Variable('Air temperature', '2 m above ground', 'instant', 'temperature', 1,
                            'Air temperature at 2 m.'),
    'dewPoint': Variable('Dew point', '2 m above ground', 'instant', 'temperature', 1,
                         'Dew point temperature at 2 m.'),
    'relativeHumidity': Variable('Relative humidity', '2 m above ground', 'instant', 'percent', 0,
                                 'Relative humidity at 2 m.'),
    'windSpeed': Variable('Wind speed', '10 m above ground', 'instant', 'speed', 1,
                          'Sustained wind speed at 10 m.'),
    'windDirection': Variable('Wind direction', '10 m above ground', 'instant', 'direction', 0,
                              'Direction the wind blows from, degrees clockwise from true north. '
                              'Null when the wind is calm.'),
    'windGust': Variable('Wind gust', 'surface', 'instant', 'speed', 1,
                         "The model's own surface wind-gust field. Not provided by every model."),
    'precipitationRate': Variable('Precipitation rate', 'surface', 'period-average', 'rate', 3,
                                  'Average precipitation rate over the preceding forecast step '
                                  '(precipitationPeriodHours).'),
    'precipitationAmount': Variable('Precipitation', 'surface', 'period-total', 'depth', 3,
                                    'Total liquid-equivalent precipitation in the preceding forecast step '
                                    '(precipitationPeriodHours). Not cumulative across steps.'),
    'pressureSurface': Variable('Surface pressure', 'surface', 'instant', 'pressure', 1,
                                'Station (surface) pressure, not reduced to sea level.'),
    'pressureMsl': Variable('Sea-level pressure', 'mean sea level', 'instant', 'pressure', 1,
                            'Pressure reduced to mean sea level.'),
    'cloudCover': Variable('Cloud cover', 'entire atmosphere', 'instant', 'percent', 0,
                           'Total cloud cover.'),
}

# What a request gets when it doesn't name variables: the fire-weather inputs.
DEFAULT_VARIABLES = (
    'temperature', 'relativeHumidity', 'windSpeed', 'windDirection', 'windGust',
    'precipitationRate', 'precipitationAmount', 'pressureSurface',
)

UNIT_SYSTEMS = {
    'us': {'temperature': '°F', 'percent': '%', 'speed': 'mph', 'direction': '°',
           'rate': 'in/h', 'depth': 'in', 'pressure': 'hPa'},
    'si': {'temperature': '°C', 'percent': '%', 'speed': 'm/s', 'direction': '°',
           'rate': 'mm/h', 'depth': 'mm', 'pressure': 'hPa'},
}

# Below this the direction of a wind vector is noise, so it's reported as
# calm (null direction) instead of a meaningless bearing.
CALM_MS = 0.1


def wind_speed_direction(u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Earth-relative u/v (m/s) -> speed (m/s) and meteorological direction (from, °true)."""
    speed = np.hypot(u, v)
    direction = np.mod(270.0 - np.degrees(np.arctan2(v, u)), 360.0)
    direction = np.where(speed < CALM_MS, np.nan, direction)
    return speed, direction


def period_seconds(lead_seconds: np.ndarray) -> np.ndarray:
    """Length of the step ending at each lead time; NaN at lead 0."""
    periods = np.empty_like(lead_seconds, dtype='float64')
    periods[0] = np.nan
    periods[1:] = np.diff(lead_seconds)
    return periods


def si_series(var: str, raw: dict[str, np.ndarray], lead_seconds: np.ndarray, wind=None) -> np.ndarray:
    """One normalized variable, in SI units, from the provider's raw arrays."""
    if var in ('windSpeed', 'windDirection'):
        speed, direction = wind
        return speed if var == 'windSpeed' else direction
    if var == 'temperature':
        return raw['temperature_2m']
    if var == 'dewPoint':
        return raw['dew_point_temperature_2m']
    if var == 'relativeHumidity':
        return raw['relative_humidity_2m']
    if var == 'windGust':
        return raw['wind_gust_surface']
    if var == 'precipitationRate':
        rate = raw['precipitation_surface'] * 3600.0  # kg m-2 s-1 == mm/s -> mm/h
        rate[0] = np.nan  # no preceding step at lead 0
        return rate
    if var == 'precipitationAmount':
        amount = raw['precipitation_surface'] * period_seconds(lead_seconds)  # mm in the step
        return amount
    if var == 'pressureSurface':
        return raw['pressure_surface'] / 100.0  # Pa -> hPa
    if var == 'pressureMsl':
        return raw['pressure_reduced_to_mean_sea_level'] / 100.0
    if var == 'cloudCover':
        return raw['total_cloud_cover_atmosphere']
    raise KeyError(var)


def convert(values: np.ndarray, quantity: str, units: str) -> np.ndarray:
    if units == 'si':
        return values
    if quantity == 'temperature':
        return values * 9.0 / 5.0 + 32.0
    if quantity == 'speed':
        return values * MS_TO_MPH
    if quantity in ('rate', 'depth'):
        return values / MM_PER_IN
    return values


def to_json_number(value: float, decimals: int):
    if value is None or not math.isfinite(value):
        return None
    if decimals == 0:
        return int(round(value))
    rounded = round(float(value), decimals)
    return 0.0 if rounded == 0 else rounded  # no "-0.0"


def build_series(provider, point, run_time: int, lead_seconds: np.ndarray, raw: dict[str, np.ndarray],
                 variables: list[str], units: str, lead_count: int) -> list[dict]:
    """The forecast array: one entry per lead time, each variable converted and rounded."""
    leads = lead_seconds[:lead_count]
    raw = {k: np.array(v[:lead_count], dtype='float64') for k, v in raw.items()}

    wind = None
    if 'windSpeed' in variables or 'windDirection' in variables:
        u, v = provider.earth_relative_wind(raw['wind_u_10m'], raw['wind_v_10m'], point)
        wind = wind_speed_direction(u, v)

    columns = {}
    for var in variables:
        meta = VARIABLES[var]
        columns[var] = convert(si_series(var, raw, leads, wind), meta.quantity, units)

    has_precip = 'precipitationRate' in variables or 'precipitationAmount' in variables
    periods = period_seconds(leads) / 3600.0

    entries = []
    for i, lead in enumerate(leads):
        valid = run_time + int(lead)
        entry = {
            'validTime': iso(valid),
            'forecastHour': int(round(lead / 3600.0)),
        }
        if has_precip:
            entry['precipitationPeriodHours'] = to_json_number(periods[i], 0)
        for var in variables:
            entry[var] = to_json_number(columns[var][i], VARIABLES[var].decimals)
        entries.append(entry)
    return entries


def units_block(variables: list[str], units: str) -> dict:
    system = UNIT_SYSTEMS[units]
    return {var: system[VARIABLES[var].quantity] for var in variables}


def variables_block(variables: list[str]) -> dict:
    return {
        var: {
            'label': VARIABLES[var].label,
            'level': VARIABLES[var].level,
            'timeSemantics': VARIABLES[var].time_semantics,
            'description': VARIABLES[var].description,
        }
        for var in variables
    }


def iso(epoch_seconds: float) -> str:
    import datetime as dt

    return dt.datetime.fromtimestamp(int(epoch_seconds), tz=dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
