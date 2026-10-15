"""
fields.py
The HAFS map fields Sentinel renders: which GRIB2 messages each one comes
from (selected by the .idx inventory), how it's converted to display units,
how it's encoded into an 8-bit frame, and how it's coloured.

Native vs calculated. `origin` says where a field comes from:
  'native'      a field HAFS writes itself (the GRIB2 message is the value);
  'calculated'  computed here from native fields (wind speed from the u/v
                components, apparent temperature, wind chill). The API and UI
                label these "calculated", never as model output fields.

Time semantics follow the inventory, not assumptions. At forecast hour h:
  instant           `h hour fcst` (or `anl` at h = 0)
  max-past-hour     `(h-1)-h hour max fcst`        (HAFS's 10 m max wind, updraft helicity)
  average-3h        `(h-3)-h hour ave fcst`        (precipitation rate)
  accum-3h          `(h-3)-h hour acc fcst`        (3-hour precipitation)
  accum-total       `0-h hour acc fcst`            (precipitation since the run started)
A field whose message isn't in that hour's inventory is unavailable for that
hour (precipitation at f000, for instance); nothing is substituted.

Encoding is the Models-tab convention (cloud/weather-models/fields/variables.py,
cloud/mrms/products.py): byte 0 = no data (transparent), bytes 1-255 map
[lo, hi] linearly or on a square-root scale; the browser colours bytes with
Mapbox `raster-color`. Palettes are (value, hex, alpha) stops in the field's
units. Ranges are set for tropical cyclones: MSLP to 900 hPa and wind to
80 m/s, with wind colour steps at the 34, 50 and 64 kt thresholds and the
Saffir-Simpson category boundaries.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

from idx import Entry, find

ENTIRE_ATMOSPHERE = 'entire atmosphere (considered as a single layer)'
MS_TO_KT = 1.943844


@dataclass(frozen=True)
class Need:
    """One GRIB2 message a field needs: variable, level and time semantics."""

    var: str
    level: str
    timing: str = 'instant'  # instant | max-past-hour | average-3h | accum-3h | accum-total

    def select(self, entries: list[Entry], hour: int) -> Entry | None:
        h = float(hour)
        if self.timing == 'instant':
            return (find(entries, self.var, self.level, kind='fcst', period_end=h)
                    or (find(entries, self.var, self.level, kind='anl') if hour == 0 else None))
        if self.timing == 'max-past-hour':
            return find(entries, self.var, self.level, kind='max', period_start=h - 1, period_end=h)
        if self.timing == 'average-3h':
            return find(entries, self.var, self.level, kind='ave', period_start=h - 3, period_end=h)
        if self.timing == 'accum-3h':
            return find(entries, self.var, self.level, kind='acc', period_start=h - 3, period_end=h)
        if self.timing == 'accum-total':
            return find(entries, self.var, self.level, kind='acc', period_start=0.0, period_end=h) if hour > 0 else None
        raise ValueError(self.timing)


@dataclass(frozen=True)
class HafsField:
    id: str
    label: str
    origin: str  # 'native' | 'calculated'
    group: str  # UI grouping
    quantity: str  # display unit family (src/app/api/modelFields.js DISPLAY_UNITS)
    units: str  # units of the encoded values
    level: str
    time_semantics: str
    needs: tuple[Need, ...]
    compute: Callable[[list[np.ndarray]], np.ndarray]
    lo: float
    hi: float
    palette: tuple[tuple[float, str, float], ...]
    description: str
    transform: str = 'linear'
    notice: str | None = None

    def to_api(self) -> dict:
        out = {
            'id': self.id, 'label': self.label, 'origin': self.origin, 'group': self.group,
            'quantity': self.quantity, 'units': self.units, 'level': self.level, 'timeSemantics': self.time_semantics,
            'description': self.description,
            'source': [{'var': n.var, 'level': n.level, 'timing': n.timing} for n in self.needs],
            'encoding': {'transform': self.transform, 'lo': self.lo, 'hi': self.hi, 'nodata': 0, 'min': 1, 'max': 255},
            'palette': [[v, c, a] for v, c, a in self.palette],
        }
        if self.notice:
            out['notice'] = self.notice
        return out

    def select(self, entries: list[Entry], hour: int) -> list[Entry] | None:
        """The inventory entries this field needs at `hour`, or None if any is missing."""
        picked = [n.select(entries, hour) for n in self.needs]
        return None if any(p is None for p in picked) else picked


# ── conversions and calculations ──

def _k_to_c(a):
    return a[0] - 273.15


def _same(a):
    return a[0]


def _pa_to_hpa(a):
    return a[0] / 100.0


def _rate_mm_h(a):
    return a[0] * 3600.0  # kg m⁻² s⁻¹ = mm s⁻¹


def _speed(a):
    return np.hypot(a[0], a[1])


def heat_index_f(t_f, rh):
    """NWS heat index (Rothfusz regression with the NWS adjustments), °F. Defined where its result is ≥ 80 °F."""
    simple = 0.5 * (t_f + 61.0 + (t_f - 68.0) * 1.2 + rh * 0.094)
    hi = (-42.379 + 2.04901523 * t_f + 10.14333127 * rh - 0.22475541 * t_f * rh - 6.83783e-3 * t_f ** 2
          - 5.481717e-2 * rh ** 2 + 1.22874e-3 * t_f ** 2 * rh + 8.5282e-4 * t_f * rh ** 2 - 1.99e-6 * t_f ** 2 * rh ** 2)
    low_rh = (rh < 13) & (t_f >= 80) & (t_f <= 112)
    hi = np.where(low_rh, hi - ((13 - rh) / 4) * np.sqrt(np.clip((17 - np.abs(t_f - 95.0)) / 17, 0, None)), hi)
    high_rh = (rh > 85) & (t_f >= 80) & (t_f <= 87)
    hi = np.where(high_rh, hi + ((rh - 85) / 10) * ((87 - t_f) / 5), hi)
    use_full = (simple + t_f) / 2 >= 80
    return np.where(use_full, hi, simple)


def wind_chill_f(t_f, v_mph):
    """NWS wind chill (2001), °F. Defined for T ≤ 50 °F and wind ≥ 3 mph; NaN elsewhere."""
    v16 = np.power(np.clip(v_mph, 0, None), 0.16)
    wc = 35.74 + 0.6215 * t_f - 35.75 * v16 + 0.4275 * t_f * v16
    return np.where((t_f <= 50) & (v_mph >= 3), wc, np.nan)


def _f_to_c(f):
    return (f - 32.0) * 5.0 / 9.0


def _apparent(a):
    t_c = a[0] - 273.15
    rh = np.clip(a[1], 0, 100)
    v_mph = np.hypot(a[2], a[3]) * 2.2369362920544
    t_f = t_c * 9 / 5 + 32
    hi = heat_index_f(t_f, rh)
    wc = wind_chill_f(t_f, v_mph)
    out = np.where(t_f >= 80, _f_to_c(hi), np.where(np.isfinite(wc), _f_to_c(wc), t_c))
    return np.where(np.isfinite(t_c) & np.isfinite(rh), out, np.nan)


def _wind_chill(a):
    t_f = (a[0] - 273.15) * 9 / 5 + 32
    return _f_to_c(wind_chill_f(t_f, np.hypot(a[1], a[2]) * 2.2369362920544))


# ── palettes ──

_TEMPERATURE = ((-40, '#313695', 0.8), (-20, '#4575b4', 0.75), (-5, '#74add1', 0.7), (5, '#abd9e9', 0.65),
                (15, '#fee090', 0.65), (25, '#fdae61', 0.7), (35, '#f46d43', 0.75), (42, '#d73027', 0.8), (50, '#a50026', 0.85))
# m/s; steps at 34 kt (17.5), 50 kt (25.7), 64 kt (32.9, hurricane), Cat 2 (42.7), Cat 3 (49.4), Cat 4 (58.1), Cat 5 (70.5).
_WIND = ((0, '#f7fcfd', 0.0), (5, '#bfd3e6', 0.3), (10, '#8c96c6', 0.5), (17.4, '#8c6bb1', 0.65),
         (17.5, '#fee08b', 0.75), (25.7, '#fdae61', 0.8), (32.9, '#f46d43', 0.85), (42.7, '#d73027', 0.9),
         (49.4, '#a50026', 0.9), (58.1, '#7a0177', 0.92), (70.5, '#49006a', 0.95), (80, '#ffffff', 0.95))
_REFLECTIVITY = ((-10, '#000000', 0.0), (4.9, '#04e9e7', 0.0), (5, '#04e9e7', 0.55), (10, '#019ff4', 0.65),
                 (15, '#0300f4', 0.7), (20, '#02fd02', 0.75), (25, '#01c501', 0.8), (30, '#008e00', 0.8),
                 (35, '#fdf802', 0.85), (40, '#e5bc00', 0.85), (45, '#fd9500', 0.85), (50, '#fd0000', 0.9),
                 (55, '#d40000', 0.9), (60, '#bc0000', 0.9), (65, '#f800fd', 0.9), (70, '#9854c6', 0.9), (75, '#fdfdfd', 0.9))
_RAIN = ((0, '#ffffff', 0.0), (0.1, '#c6dbef', 0.0), (0.2, '#c6dbef', 0.55), (1, '#6baed6', 0.7),
         (4, '#2171b5', 0.8), (10, '#08306b', 0.85), (25, '#54278f', 0.9), (50, '#3f007d', 0.95), (100, '#d4b9da', 0.95))
_RAIN_TOTAL = ((0, '#ffffff', 0.0), (0.25, '#c6dbef', 0.0), (0.5, '#c6dbef', 0.55), (5, '#6baed6', 0.7),
               (25, '#2171b5', 0.8), (75, '#08306b', 0.85), (150, '#54278f', 0.9), (300, '#3f007d', 0.95),
               (500, '#d4b9da', 0.95), (750, '#ffffff', 0.95))

FIELDS: dict[str, HafsField] = {f.id: f for f in [
    HafsField(
        'reflectivity', 'Composite reflectivity (model)', 'native', 'Precipitation', 'reflectivity', 'dBZ',
        'column maximum', 'instant', (Need('REFC', ENTIRE_ATMOSPHERE),), _same,
        -10, 75, _REFLECTIVITY,
        "HAFS's simulated composite (column-maximum) reflectivity. Under 5 dBZ is clear.",
        notice='Model reflectivity: what the HAFS forecast simulates radar would show. It is not observed radar.'),
    HafsField(
        'temperature2m', '2 m temperature', 'native', 'Temperature & moisture', 'temperature', '°C',
        '2 m above ground', 'instant', (Need('TMP', '2 m above ground'),), _k_to_c,
        -40, 50, _TEMPERATURE, 'Air temperature at 2 m.'),
    HafsField(
        'dewPoint2m', '2 m dew point', 'native', 'Temperature & moisture', 'temperature', '°C',
        '2 m above ground', 'instant', (Need('DPT', '2 m above ground'),), _k_to_c,
        -30, 35,
        ((-30, '#8c510a', 0.75), (-10, '#bf812d', 0.65), (0, '#dfc27d', 0.55), (10, '#c7eae5', 0.5),
         (18, '#80cdc1', 0.6), (22, '#35978f', 0.7), (25, '#01665e', 0.8), (28, '#003c30', 0.85), (35, '#00241c', 0.9)),
        'Dew point at 2 m.'),
    HafsField(
        'relativeHumidity2m', '2 m relative humidity', 'native', 'Temperature & moisture', 'percent', '%',
        '2 m above ground', 'instant', (Need('RH', '2 m above ground'),), _same,
        0, 100,
        ((0, '#8c510a', 0.8), (15, '#bf812d', 0.75), (30, '#dfc27d', 0.6), (50, '#f6e8c3', 0.35),
         (70, '#c7eae5', 0.45), (85, '#5ab4ac', 0.65), (100, '#01665e', 0.75)),
        'Relative humidity at 2 m.'),
    HafsField(
        'windSpeed10m', '10 m wind speed', 'calculated', 'Wind', 'speed', 'm/s',
        '10 m above ground', 'instant', (Need('UGRD', '10 m above ground'), Need('VGRD', '10 m above ground')), _speed,
        0, 80, _WIND,
        'Instantaneous 10 m wind speed, calculated as √(u² + v²) from the native u and v components.'),
    HafsField(
        'windMax10m', '10 m max wind (past hour)', 'native', 'Wind', 'speed', 'm/s',
        '10 m above ground', 'max-past-hour', (Need('WIND', '10 m above ground', 'max-past-hour'),), _same,
        0, 80, _WIND,
        "HAFS's own maximum 10 m wind speed over the hour ending at this forecast hour."),
    HafsField(
        'gust', 'Wind gust', 'native', 'Wind', 'speed', 'm/s',
        'surface', 'instant', (Need('GUST', 'surface'),), _same,
        0, 80, _WIND, "HAFS's surface wind-gust field."),
    HafsField(
        'mslp', 'Mean sea-level pressure', 'native', 'Pressure', 'pressure', 'hPa',
        'mean sea level', 'instant', (Need('PRMSL', 'mean sea level'),), _pa_to_hpa,
        900, 1030,
        ((900, '#3f007d', 0.85), (940, '#54278f', 0.8), (970, '#2171b5', 0.7), (990, '#6baed6', 0.55),
         (1005, '#d1e5f0', 0.3), (1013, '#bdbdbd', 0.15), (1030, '#ef8a62', 0.5)),
        'Pressure reduced to mean sea level (PRMSL). The storm centre is the minimum.'),
    HafsField(
        'precipRate', 'Precipitation rate', 'native', 'Precipitation', 'rate', 'mm/h',
        'surface', 'average-3h', (Need('PRATE', 'surface', 'average-3h'),), _rate_mm_h,
        0, 100, _RAIN, 'Average precipitation rate over the 3 hours ending at this forecast hour. Under 0.1 mm/h is clear.',
        transform='sqrt'),
    HafsField(
        'precip3h', '3-hour precipitation', 'native', 'Precipitation', 'depth', 'mm',
        'surface', 'accum-3h', (Need('APCP', 'surface', 'accum-3h'),), _same,
        0, 200, _RAIN_TOTAL, 'Precipitation accumulated over the 3 hours ending at this forecast hour.', transform='sqrt'),
    HafsField(
        'precipTotal', 'Total precipitation', 'native', 'Precipitation', 'depth', 'mm',
        'surface', 'accum-total', (Need('APCP', 'surface', 'accum-total'),), _same,
        0, 750, _RAIN_TOTAL, "Precipitation accumulated since this run's start (none at +0 h).", transform='sqrt'),
    HafsField(
        'cape', 'CAPE (surface-based)', 'native', 'Instability', 'energy', 'J/kg',
        'surface', 'instant', (Need('CAPE', 'surface'),), _same,
        0, 5000,
        ((0, '#ffffff', 0.0), (100, '#ffffcc', 0.0), (250, '#ffffcc', 0.45), (1000, '#fed976', 0.6),
         (2000, '#fd8d3c', 0.75), (3000, '#e31a1c', 0.85), (5000, '#800026', 0.9)),
        'Surface-based convective available potential energy.'),
    HafsField(
        'pwat', 'Precipitable water', 'native', 'Temperature & moisture', 'depth', 'mm',
        ENTIRE_ATMOSPHERE, 'instant', (Need('PWAT', ENTIRE_ATMOSPHERE),), _same,
        0, 80,
        ((0, '#ffffff', 0.0), (10, '#edf8b1', 0.3), (25, '#c7e9b4', 0.45), (40, '#41b6c4', 0.65),
         (55, '#225ea8', 0.8), (70, '#081d58', 0.9), (80, '#081d58', 0.9)),
        'Total column precipitable water (kg/m² = mm).'),
    HafsField(
        'cloudCover', 'Total cloud cover', 'native', 'Clouds', 'percent', '%',
        ENTIRE_ATMOSPHERE, 'instant', (Need('TCDC', ENTIRE_ATMOSPHERE),), _same,
        0, 100,
        ((0, '#ffffff', 0.0), (10, '#ffffff', 0.0), (40, '#f0f0f0', 0.35), (70, '#e0e0e0', 0.6), (100, '#ffffff', 0.85)),
        'Instantaneous total cloud cover.'),
    HafsField(
        'updraftHelicity', 'Updraft helicity 2–5 km (past-hour max)', 'native', 'Instability', 'helicity', 'm²/s²',
        '5000-2000 m above ground', 'max-past-hour', (Need('MXUPHL', '5000-2000 m above ground', 'max-past-hour'),), _same,
        0, 300,
        ((0, '#ffffff', 0.0), (24.9, '#fcbba1', 0.0), (25, '#fcbba1', 0.6), (75, '#fb6a4a', 0.8),
         (150, '#cb181d', 0.9), (300, '#67000d', 0.95)),
        'Maximum 2–5 km updraft helicity over the past hour: rotating updrafts, including tornado-producing '
        'rainband cells at landfall. Under 25 m²/s² is clear.'),
    HafsField(
        'stormRelativeHelicity', '0–3 km storm-relative helicity', 'native', 'Instability', 'helicity', 'm²/s²',
        '3000-0 m above ground', 'instant', (Need('HLCY', '3000-0 m above ground'),), _same,
        0, 800,
        ((0, '#ffffff', 0.0), (49, '#c6dbef', 0.0), (50, '#c6dbef', 0.4), (150, '#6baed6', 0.6),
         (300, '#2171b5', 0.75), (500, '#08519c', 0.85), (800, '#08306b', 0.9)),
        'Storm-relative helicity in the lowest 3 km. Negative values are drawn clear.'),
    HafsField(
        'skinTemperature', 'Surface (skin) temperature', 'native', 'Temperature & moisture', 'temperature', '°C',
        'surface', 'instant', (Need('TMP', 'surface'),), _k_to_c,
        15, 35,
        ((15, '#313695', 0.7), (20, '#74add1', 0.7), (24, '#e0f3f8', 0.7), (26.5, '#fee090', 0.75),
         (28, '#fdae61', 0.8), (30, '#f46d43', 0.85), (32, '#d73027', 0.85), (35, '#a50026', 0.9)),
        'Skin temperature: sea-surface temperature over water (26.5 °C is the usual threshold for '
        'tropical cyclone development), ground temperature over land.'),
    HafsField(
        'apparentTemperature', 'Apparent temperature', 'calculated', 'Temperature & moisture', 'temperature', '°C',
        '2 m above ground', 'instant',
        (Need('TMP', '2 m above ground'), Need('RH', '2 m above ground'),
         Need('UGRD', '10 m above ground'), Need('VGRD', '10 m above ground')), _apparent,
        -40, 50, _TEMPERATURE,
        'Calculated, not a HAFS output field: the NWS heat index where it is 80 °F or warmer, the NWS wind '
        'chill where it is 50 °F or colder with wind of at least 3 mph, otherwise the air temperature. From '
        'native 2 m temperature and humidity and 10 m wind.'),
    HafsField(
        'windChill', 'Wind chill', 'calculated', 'Temperature & moisture', 'temperature', '°C',
        '2 m above ground', 'instant',
        (Need('TMP', '2 m above ground'), Need('UGRD', '10 m above ground'), Need('VGRD', '10 m above ground')), _wind_chill,
        -50, 10,
        ((-50, '#081d58', 0.85), (-35, '#253494', 0.8), (-20, '#225ea8', 0.75), (-10, '#41b6c4', 0.65),
         (0, '#a1dab4', 0.5), (10, '#ffffcc', 0.4)),
        'Calculated, not a HAFS output field: the NWS wind chill from native 2 m temperature and 10 m wind. '
        'Only defined at 50 °F (10 °C) or colder with wind of at least 3 mph; clear elsewhere, which over '
        'the tropics is almost everywhere.'),
]}


def encode_bytes(values: np.ndarray, lo: float, hi: float, transform: str = 'linear') -> np.ndarray:
    """Values → uint8 (0 = no data, 1..255 = [lo, hi]). Same as cloud/weather-models/fields/variables.py."""
    with np.errstate(invalid='ignore'):
        v = np.clip(values, lo, hi)
        t = np.sqrt(v - lo) / np.sqrt(hi - lo) if transform == 'sqrt' else (v - lo) / (hi - lo)
        out = np.rint(1 + t * 254)
    out = np.where(np.isfinite(values), out, 0)
    return out.astype('uint8')


def decode_bytes(b: np.ndarray, lo: float, hi: float, transform: str = 'linear') -> np.ndarray:
    t = (b.astype('float64') - 1) / 254
    v = lo + (t * np.sqrt(hi - lo)) ** 2 if transform == 'sqrt' else lo + t * (hi - lo)
    return np.where(b == 0, np.nan, v)
