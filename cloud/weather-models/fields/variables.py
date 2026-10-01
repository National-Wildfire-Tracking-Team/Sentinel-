"""
fields/variables.py
The map fields Sentinel renders, what each is computed from, how it is
encoded into an image, and how it is coloured.

Encoding. A field frame is an 8-bit greyscale PNG. Byte 0 means "no data"
(drawn transparent); bytes 1-255 map linearly onto the variable's encoded
range [lo, hi] after an optional transform (sqrt for precipitation, so light
rain keeps resolution). The browser colours bytes with Mapbox `raster-color`,
so palettes and display units change without new images. Images are for
display only: 8 bits is ~0.35 °C for temperature. Values a user reads come
from the point API, at full precision.

Palettes are in SI units, as (value, hex, alpha) stops. They are sequential
for magnitudes and diverging with a neutral grey midpoint for differences;
none is a rainbow.

Difference fields (HRRR − GFS) exist only for variables that mean the same
thing in both models at the same valid time and over the same window. They
don't exist for gusts (not in GFS), precipitation totals (each model's total
starts at its own run time), surface pressure (each model's terrain height
differs, so the difference is mostly terrain) or cloud cover (not requested).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass(frozen=True)
class FieldVariable:
    id: str
    label: str
    quantity: str  # unit family for display conversion: temperature|percent|speed|rate|depth|pressure|reflectivity
    units: str  # SI units of the encoded values
    level: str
    time_semantics: str  # instant | period-average | since-run-start
    sources: tuple[str, ...]  # dataset variables (same names in HRRR and GFS)
    lo: float
    hi: float
    palette: tuple[tuple[float, str, float], ...]
    transform: str = 'linear'  # linear | sqrt
    models: tuple[str, ...] = ('hrrr', 'gfs')
    diff: tuple[float, float] | None = None  # symmetric range for HRRR − GFS, or None if not comparable
    description: str = ''
    extra: dict = field(default_factory=dict)

    def to_manifest(self) -> dict:
        out = {
            'label': self.label, 'quantity': self.quantity, 'units': self.units, 'level': self.level,
            'timeSemantics': self.time_semantics, 'models': list(self.models), 'description': self.description,
            'encoding': {'transform': self.transform, 'lo': self.lo, 'hi': self.hi, 'nodata': 0, 'min': 1, 'max': 255},
            'palette': [[v, c, a] for v, c, a in self.palette],
        }
        if self.extra.get('notice'):
            out['notice'] = self.extra['notice']
        if self.diff:
            out['difference'] = {
                'subtract': 'HRRR − GFS',
                'encoding': {'transform': 'linear', 'lo': self.diff[0], 'hi': self.diff[1], 'nodata': 0, 'min': 1, 'max': 255},
                'palette': [[v, c, a] for v, c, a in diverging(self.diff[1])],
            }
        return out


def diverging(limit: float):
    """Blue (HRRR lower) — transparent near zero — red (HRRR higher).

    Agreement within a tenth of the range is see-through, so colour on the
    map means the models genuinely disagree there.
    """
    return (
        (-limit, '#2166ac', 0.85), (-limit / 2, '#67a9cf', 0.7), (-limit / 5, '#d1e5f0', 0.45),
        (-limit / 10, '#bdbdbd', 0.0), (limit / 10, '#bdbdbd', 0.0),
        (limit / 5, '#fddbc7', 0.45), (limit / 2, '#ef8a62', 0.7), (limit, '#b2182b', 0.85),
    )


FIELD_VARIABLES: dict[str, FieldVariable] = {v.id: v for v in [
    FieldVariable(
        'temperature', 'Temperature', 'temperature', '°C', '2 m above ground', 'instant', ('temperature_2m',),
        -40, 50,
        ((-40, '#313695', 0.8), (-20, '#4575b4', 0.75), (-5, '#74add1', 0.7), (5, '#abd9e9', 0.65),
         (15, '#fee090', 0.65), (25, '#fdae61', 0.7), (35, '#f46d43', 0.75), (42, '#d73027', 0.8), (50, '#a50026', 0.85)),
        diff=(-10, 10), description='Air temperature at 2 m.'),
    FieldVariable(
        'relativeHumidity', 'Humidity', 'percent', '%', '2 m above ground', 'instant', ('relative_humidity_2m',),
        0, 100,
        ((0, '#8c510a', 0.8), (15, '#bf812d', 0.75), (30, '#dfc27d', 0.6), (50, '#f6e8c3', 0.35),
         (70, '#c7eae5', 0.45), (85, '#5ab4ac', 0.65), (100, '#01665e', 0.75)),
        diff=(-40, 40), description='Relative humidity at 2 m. Browns are dry (fire-weather concern), teals are moist.'),
    FieldVariable(
        'windSpeed', 'Wind', 'speed', 'm/s', '10 m above ground', 'instant', ('wind_u_10m', 'wind_v_10m'),
        0, 40,
        ((0, '#f7fcfd', 0.0), (3, '#bfd3e6', 0.35), (7, '#8c96c6', 0.55), (12, '#8c6bb1', 0.7),
         (18, '#88419d', 0.8), (25, '#6e016b', 0.85), (40, '#3f007d', 0.9)),
        diff=(-15, 15), description='Sustained wind speed at 10 m; animated particles show direction.'),
    FieldVariable(
        'windGust', 'Gusts', 'speed', 'm/s', 'surface', 'instant', ('wind_gust_surface',),
        0, 50,
        ((0, '#f7fcfd', 0.0), (5, '#bfd3e6', 0.35), (10, '#8c96c6', 0.55), (16, '#8c6bb1', 0.7),
         (23, '#88419d', 0.8), (32, '#6e016b', 0.85), (50, '#3f007d', 0.9)),
        models=('hrrr',), description="HRRR's surface wind-gust field. GFS doesn't provide gusts."),
    FieldVariable(
        'precipitationRate', 'Precipitation', 'rate', 'mm/h', 'surface', 'period-average', ('precipitation_surface',),
        0, 50,
        ((0, '#ffffff', 0.0), (0.1, '#c6dbef', 0.0), (0.2, '#c6dbef', 0.55), (1, '#6baed6', 0.7),
         (4, '#2171b5', 0.8), (10, '#08306b', 0.85), (25, '#54278f', 0.9), (50, '#3f007d', 0.95)),
        transform='sqrt', diff=(-10, 10),
        description='Average rate over the preceding forecast step (1 h; 3 h for GFS after 120 h). Under 0.1 mm/h is clear.'),
    FieldVariable(
        'precipitationTotal', 'Precip total', 'depth', 'mm', 'surface', 'since-run-start', ('precipitation_surface',),
        0, 150,
        ((0, '#ffffff', 0.0), (0.25, '#c6dbef', 0.0), (0.5, '#c6dbef', 0.55), (5, '#6baed6', 0.7),
         (15, '#2171b5', 0.8), (35, '#08306b', 0.85), (75, '#54278f', 0.9), (150, '#3f007d', 0.95)),
        transform='sqrt',
        description="Total since this run's start time. Not comparable between models whose runs start at different times."),
    FieldVariable(
        'compositeReflectivity', 'Reflectivity (simulated)', 'reflectivity', 'dBZ', 'column maximum', 'instant',
        ('composite_reflectivity',),
        -10, 75,
        # The conventional radar dBZ scale: a domain convention readers rely
        # on, kept despite being multi-hue. Clear below 5 dBZ (no echo).
        ((-10, '#000000', 0.0), (4.9, '#04e9e7', 0.0), (5, '#04e9e7', 0.55), (10, '#019ff4', 0.65),
         (15, '#0300f4', 0.7), (20, '#02fd02', 0.75), (25, '#01c501', 0.8), (30, '#008e00', 0.8),
         (35, '#fdf802', 0.85), (40, '#e5bc00', 0.85), (45, '#fd9500', 0.85), (50, '#fd0000', 0.9),
         (55, '#d40000', 0.9), (60, '#bc0000', 0.9), (65, '#f800fd', 0.9), (70, '#9854c6', 0.9), (75, '#fdfdfd', 0.9)),
        models=('hrrr',),
        description="HRRR's simulated composite (column-maximum) radar reflectivity. Not in GFS.",
        extra={'notice': 'Simulated by the HRRR model: a forecast of what radar would show, not radar observations.'}),
    FieldVariable(
        'pressureMsl', 'Sea-level pressure', 'pressure', 'hPa', 'mean sea level', 'instant',
        ('pressure_reduced_to_mean_sea_level',),
        960, 1050,
        ((960, '#2166ac', 0.7), (990, '#67a9cf', 0.55), (1005, '#d1e5f0', 0.3), (1013, '#bdbdbd', 0.15),
         (1021, '#fddbc7', 0.3), (1035, '#ef8a62', 0.55), (1050, '#b2182b', 0.7)),
        diff=(-10, 10), description='Pressure reduced to mean sea level; blues are lows, reds are highs.'),
    FieldVariable(
        'pressureSurface', 'Surface pressure', 'pressure', 'hPa', 'surface', 'instant', ('pressure_surface',),
        500, 1050,
        ((500, '#252525', 0.75), (700, '#636363', 0.6), (850, '#969696', 0.45), (950, '#cccccc', 0.3), (1050, '#f7f7f7', 0.2)),
        description='Station pressure, not reduced to sea level, so it mostly follows terrain height.'),
    FieldVariable(
        'cloudCover', 'Cloud cover', 'percent', '%', 'entire atmosphere', 'instant', ('total_cloud_cover_atmosphere',),
        0, 100,
        ((0, '#ffffff', 0.0), (10, '#ffffff', 0.0), (40, '#f0f0f0', 0.35), (70, '#e0e0e0', 0.6), (100, '#ffffff', 0.85)),
        description='Total cloud cover.'),
]}

# Wind vectors for the particle animation: earth-relative u (R) and v (G).
WIND_VECTOR_RANGE = 50.0  # m/s, encoded linearly into bytes 1..255; alpha 0 = no data


def derive(var: FieldVariable, raw: dict[str, np.ndarray], lead_seconds: np.ndarray, hour_index: int,
           state: dict) -> np.ndarray:
    """SI values for one lead time, on the *source* grid. `state` carries running totals."""
    if var.id == 'windSpeed':
        return np.hypot(raw['wind_u_10m'][hour_index], raw['wind_v_10m'][hour_index])
    if var.id == 'precipitationRate':
        if hour_index == 0:
            return np.full(raw['precipitation_surface'].shape[1:], np.nan, dtype='float32')
        return raw['precipitation_surface'][hour_index] * 3600.0
    if var.id == 'precipitationTotal':
        total = state.get('total')
        if total is None:
            total = np.zeros(raw['precipitation_surface'].shape[1:], dtype='float32')
        if hour_index > 0:
            step = float(lead_seconds[hour_index] - lead_seconds[hour_index - 1])
            total = total + raw['precipitation_surface'][hour_index] * step  # mm in this step
        state['total'] = total
        return total
    if var.id in ('pressureMsl', 'pressureSurface'):
        return raw[var.sources[0]][hour_index] / 100.0
    return raw[var.sources[0]][hour_index]


def encode_bytes(values: np.ndarray, lo: float, hi: float, transform: str = 'linear') -> np.ndarray:
    """SI values → uint8 (0 = no data, 1..255 = [lo, hi])."""
    v = np.clip(values, lo, hi)
    if transform == 'sqrt':
        t = (np.sqrt(v - lo) - 0.0) / np.sqrt(hi - lo)
    else:
        t = (v - lo) / (hi - lo)
    out = np.rint(1 + t * 254)
    out = np.where(np.isfinite(values), out, 0)
    return out.astype('uint8')


def decode_bytes(b: np.ndarray, lo: float, hi: float, transform: str = 'linear') -> np.ndarray:
    """Inverse of encode_bytes (for tests and for documentation of the client's math)."""
    t = (b.astype('float64') - 1) / 254
    if transform == 'sqrt':
        v = lo + (t * np.sqrt(hi - lo)) ** 2
    else:
        v = lo + t * (hi - lo)
    return np.where(b == 0, np.nan, v)
