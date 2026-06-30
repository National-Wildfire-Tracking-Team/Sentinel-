"""
color_tables.py
NWS-standard reflectivity color table and RGBA lookup.
Additional products (velocity, ZDR, CC, SRM) can be added here.
"""

import numpy as np

# NWS standard base reflectivity color table (dBZ → RGBA)
# Each entry: (min_dbz, max_dbz, R, G, B, A)
# Transparent below 5 dBZ — removes noise / clear-air returns
_REFLECTIVITY_STOPS = [
    (  5, 10, 0x04, 0xe9, 0xe9, 200),   # light cyan
    ( 10, 15, 0x01, 0x9f, 0xf4, 210),   # blue
    ( 15, 20, 0x03, 0x00, 0xf4, 220),   # deep blue
    ( 20, 25, 0x02, 0xfd, 0x02, 210),   # bright green
    ( 25, 30, 0x01, 0xc5, 0x01, 220),   # green
    ( 30, 35, 0x00, 0x8e, 0x00, 225),   # dark green
    ( 35, 40, 0xfd, 0xf8, 0x02, 220),   # yellow
    ( 40, 45, 0xe5, 0xbc, 0x00, 225),   # amber
    ( 45, 50, 0xfd, 0x95, 0x00, 230),   # orange
    ( 50, 55, 0xfd, 0x00, 0x00, 235),   # red
    ( 55, 60, 0xd4, 0x00, 0x00, 240),   # dark red
    ( 60, 65, 0xbc, 0x00, 0x00, 245),   # very dark red
    ( 65, 70, 0xf8, 0x00, 0xfd, 250),   # magenta
    ( 70, 999, 0x98, 0x54, 0xc6, 255),  # purple — extreme hail
]

# Pre-build a LUT for integer dBZ 0…80 → RGBA uint8[4]
_LUT_SIZE = 81
_reflectivity_lut = np.zeros((_LUT_SIZE, 4), dtype=np.uint8)

for _lo, _hi, _r, _g, _b, _a in _REFLECTIVITY_STOPS:
    for _z in range(int(_lo), min(int(_hi), _LUT_SIZE)):
        _reflectivity_lut[_z] = [_r, _g, _b, _a]


def dbz_to_rgba(dbz_array: np.ndarray) -> np.ndarray:
    """
    Map a 2-D float array of dBZ values to RGBA uint8 image data.
    NaN / masked values are rendered as fully transparent.
    Returns shape (H, W, 4) uint8.
    """
    h, w = dbz_array.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)

    valid = np.isfinite(dbz_array) & (dbz_array >= 5.0)
    if not valid.any():
        return out

    clipped = np.clip(dbz_array[valid], 0, _LUT_SIZE - 1).astype(np.int32)
    out[valid] = _reflectivity_lut[clipped]
    return out


# ── Velocity (radial, m/s) ─────────────────────────────────────────────────────
# Diverging blue→white→red centered on 0
_VELOCITY_STOPS = [
    (-99, -50, 0x00, 0x00, 0x8b, 230),   # dark blue (toward)
    (-50, -30, 0x00, 0x00, 0xff, 225),
    (-30, -15, 0x00, 0x8b, 0xff, 215),
    (-15,  -5, 0xad, 0xd8, 0xe6, 200),
    ( -5,   5, 0x00, 0x00, 0x00,   0),   # near-zero: transparent
    (  5,  15, 0xff, 0xb6, 0xb6, 200),
    ( 15,  30, 0xff, 0x45, 0x00, 215),
    ( 30,  50, 0xff, 0x00, 0x00, 225),
    ( 50, 999, 0x8b, 0x00, 0x00, 230),   # dark red (away)
]

_vel_lut_size = 200   # -99 to +100 m/s offset by 99
_velocity_lut = np.zeros((_vel_lut_size, 4), dtype=np.uint8)
for _lo, _hi, _r, _g, _b, _a in _VELOCITY_STOPS:
    for _v in range(int(_lo) + 99, min(int(_hi) + 99, _vel_lut_size)):
        _velocity_lut[_v] = [_r, _g, _b, _a]


def velocity_to_rgba(vel_array: np.ndarray) -> np.ndarray:
    h, w = vel_array.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    valid = np.isfinite(vel_array)
    if not valid.any():
        return out
    idx = np.clip(vel_array[valid].astype(np.int32) + 99, 0, _vel_lut_size - 1)
    out[valid] = _velocity_lut[idx]
    return out


# Registry maps product key → color-mapping function
COLORIZE = {
    'reflectivity': dbz_to_rgba,
    'velocity':     velocity_to_rgba,
}
