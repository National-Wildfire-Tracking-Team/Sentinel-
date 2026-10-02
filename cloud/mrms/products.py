"""
products.py
The MRMS products Sentinel renders, where each lives in the bucket, how its
values are encoded into 8-bit frames, and how they are coloured.

Chosen from the ~250 CONUS products in s3://noaa-mrms-pds for being useful
operationally (precipitation, severe convection, hail, rotation), updating
every 2 minutes, and drawing well as a single raster layer:

  reflectivity   MergedReflectivityQCComposite   column-maximum radar echo (dBZ)
  precipRate     PrecipRate                      surface precipitation rate (mm/h)
  qpe1h          RadarOnly_QPE_01H               radar rainfall over the past hour (mm)
  hail           MESH                            maximum estimated hail size (mm)
  rotation       RotationTrack60min              low-level (0-2 km) rotation, 60-min max (10⁻³ s⁻¹)
  echoTops       EchoTop_18                      height of the 18 dBZ echo top (km)

Left out on purpose:
  - surface wind: MRMS has none (the nearest is azimuthal shear, covered by rotation);
  - multi-sensor (gauge-corrected) QPE: published hourly with ~1 h latency, not near real time;
  - categorical products (PrecipFlag), which max-pooling and colour ramps don't suit;
  - NLDN lightning density: derived from a commercial lightning network.

Encoding is the Models-tab convention (cloud/weather-models/fields/variables.py):
byte 0 = no data (outside radar coverage, drawn transparent); bytes 1-255 map
[lo, hi] linearly or on a square-root scale. "No echo" values (−99 dBZ, −1,
0) clip to lo, which every palette draws transparent. The browser colours
bytes with Mapbox `raster-color`.

Palettes are (value, hex, alpha) stops in the product's own units. They are
sequential, except reflectivity, which keeps the conventional radar dBZ scale
that readers already know (the same one the HRRR simulated-reflectivity field uses).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Product:
    id: str
    source: str  # directory under CONUS/ in the bucket
    label: str
    quantity: str  # unit family for display conversion (src/app/api/mrms.js)
    units: str
    lo: float
    hi: float
    no_coverage_below: float  # values below this are "no radar coverage" → byte 0
    palette: tuple[tuple[float, str, float], ...]
    description: str
    transform: str = 'linear'

    @property
    def prefix(self) -> str:
        return f'CONUS/{self.source}/'

    def to_manifest(self) -> dict:
        return {
            'label': self.label,
            'quantity': self.quantity,
            'units': self.units,
            'description': self.description,
            'source': {'product': self.source, 'uri': f's3://noaa-mrms-pds/{self.prefix}'},
            'encoding': {'transform': self.transform, 'lo': self.lo, 'hi': self.hi, 'nodata': 0, 'min': 1, 'max': 255},
            'palette': [[v, c, a] for v, c, a in self.palette],
        }


# Precipitation blues → purple, as the Models tab's precipitation palettes.
_RAIN = (('#c6dbef', 0.55), ('#6baed6', 0.7), ('#2171b5', 0.8), ('#08306b', 0.85), ('#54278f', 0.9), ('#3f007d', 0.95))

PRODUCTS: dict[str, Product] = {p.id: p for p in [
    Product(
        'reflectivity', 'MergedReflectivityQCComposite_00.50', 'Composite reflectivity', 'reflectivity', 'dBZ',
        -10, 75, -900,
        ((-10, '#000000', 0.0), (4.9, '#04e9e7', 0.0), (5, '#04e9e7', 0.55), (10, '#019ff4', 0.65),
         (15, '#0300f4', 0.7), (20, '#02fd02', 0.75), (25, '#01c501', 0.8), (30, '#008e00', 0.8),
         (35, '#fdf802', 0.85), (40, '#e5bc00', 0.85), (45, '#fd9500', 0.85), (50, '#fd0000', 0.9),
         (55, '#d40000', 0.9), (60, '#bc0000', 0.9), (65, '#f800fd', 0.9), (70, '#9854c6', 0.9), (75, '#fdfdfd', 0.9)),
        'Quality-controlled maximum radar reflectivity in the column, merged from every NEXRAD and Canadian radar. '
        'Under 5 dBZ is clear.'),
    Product(
        'precipRate', 'PrecipRate_00.00', 'Precipitation rate', 'rate', 'mm/h',
        0, 150, -2,
        ((0, '#ffffff', 0.0), (0.1, '#c6dbef', 0.0), (0.2, _RAIN[0][0], _RAIN[0][1]), (1, *_RAIN[1]), (4, *_RAIN[2]),
         (10, *_RAIN[3]), (25, *_RAIN[4]), (75, *_RAIN[5])),
        'Instantaneous surface precipitation rate estimated from radar. Under 0.1 mm/h is clear.', 'sqrt'),
    Product(
        'qpe1h', 'RadarOnly_QPE_01H_00.00', 'Rainfall, past hour', 'depth', 'mm',
        0, 150, -2,
        ((0, '#ffffff', 0.0), (0.2, '#c6dbef', 0.0), (0.25, _RAIN[0][0], _RAIN[0][1]), (2.5, *_RAIN[1]), (10, *_RAIN[2]),
         (25, *_RAIN[3]), (50, *_RAIN[4]), (100, *_RAIN[5])),
        'Radar-only precipitation accumulated over the past 60 minutes, updated every 2 minutes. '
        'Not gauge-corrected.', 'sqrt'),
    Product(
        'hail', 'MESH_00.50', 'Hail size (MESH)', 'size', 'mm',
        0, 100, -2,
        ((0, '#ffffff', 0.0), (6.2, '#fee391', 0.0), (6.35, '#fee391', 0.7), (12.7, '#fec44f', 0.8),
         (25.4, '#fe9929', 0.85), (38, '#ec7014', 0.9), (50.8, '#cc4c02', 0.9), (76, '#8c2d04', 0.95), (100, '#4d1702', 0.95)),
        'Maximum Estimated Size of Hail from radar. Clear under 6 mm (¼ in); 25 mm (1 in) is severe.'),
    Product(
        'rotation', 'RotationTrack60min_00.50', 'Rotation tracks (60 min)', 'shear', '10⁻³ s⁻¹',
        0, 50, -1,
        ((0, '#ffffff', 0.0), (5.9, '#fcbba1', 0.0), (6, '#fcbba1', 0.6), (10, '#fb6a4a', 0.75),
         (15, '#de2d26', 0.85), (20, '#a50f15', 0.9), (30, '#67000d', 0.95), (50, '#3b0008', 0.95)),
        'Maximum 0-2 km azimuthal shear over the past 60 minutes: the paths of rotating storms. '
        'Rotation is not a confirmed tornado. Clear under 0.006 s⁻¹.'),
    Product(
        'echoTops', 'EchoTop_18_00.50', 'Echo tops (18 dBZ)', 'height', 'km',
        0, 20, -2,
        ((0, '#ffffff', 0.0), (1.4, '#dadaeb', 0.0), (1.5, '#dadaeb', 0.5), (5, '#bcbddc', 0.6), (8, '#9e9ac8', 0.7),
         (11, '#807dba', 0.8), (14, '#6a51a3', 0.85), (17, '#54278f', 0.9), (20, '#3f007d', 0.95)),
        'Height of the top of the 18 dBZ radar echo, a measure of how deep convection is. Clear under 1.5 km.'),
]}


def encode_bytes(values: np.ndarray, lo: float, hi: float, transform: str = 'linear') -> np.ndarray:
    """Values → uint8 (0 = no data, 1..255 = [lo, hi]). Same as weather-models fields/variables.py."""
    v = np.clip(values, lo, hi)
    if transform == 'sqrt':
        t = np.sqrt(v - lo) / np.sqrt(hi - lo)
    else:
        t = (v - lo) / (hi - lo)
    out = np.rint(1 + t * 254)
    out = np.where(np.isfinite(values), out, 0)
    return out.astype('uint8')


def decode_bytes(b: np.ndarray, lo: float, hi: float, transform: str = 'linear') -> np.ndarray:
    """Inverse of encode_bytes (tests, and documentation of the client's math)."""
    t = (b.astype('float64') - 1) / 254
    v = lo + (t * np.sqrt(hi - lo)) ** 2 if transform == 'sqrt' else lo + t * (hi - lo)
    return np.where(b == 0, np.nan, v)
