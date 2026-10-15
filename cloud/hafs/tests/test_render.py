import os
import struct
import zlib

import numpy as np
import pytest
from conftest import SERVICE_DIR

from fields import FIELDS, decode_bytes
from grib2 import LatLonGrid
from png import encode_png
from render import frame_for, merc_y, project, render


def read_png(data: bytes) -> np.ndarray:
    pos, idat = 8, b''
    while pos < len(data):
        n, kind = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b'IHDR':
            w, h, depth, color = struct.unpack('>IIBB', body[:10])
            assert (depth, color) == (8, 0)
        elif kind == b'IDAT':
            idat += body
        pos += 12 + n
    raw = np.frombuffer(zlib.decompress(idat), np.uint8).reshape(h, w + 1)
    assert (raw[:, 0] == 1).all()  # Sub filter on every row
    return (np.cumsum(raw[:, 1:].astype(np.int64), axis=1) & 0xFF).astype(np.uint8)


NEST = LatLonGrid(nx=1001, ny=801, lat_north=31.84, lon_west=-100.54, dlat=0.02, dlon=0.02)


def test_frame_keeps_native_columns_and_mercator_aspect():
    f = frame_for(NEST)
    assert f.width == 1001
    assert (f.west, f.east) == pytest.approx((-100.55, -80.53))
    span_y = float(merc_y(f.north) - merc_y(f.south))
    assert f.height == round(1001 * span_y / np.radians(f.east - f.west))
    r = lambda v: round(v, 6)  # noqa: E731
    assert f.coordinates == [[r(f.west), r(f.north)], [r(f.east), r(f.north)], [r(f.east), r(f.south)], [r(f.west), r(f.south)]]


def test_wide_grids_are_capped():
    wide = LatLonGrid(nx=5000, ny=100, lat_north=10, lon_west=-150, dlat=0.06, dlon=0.06)
    assert frame_for(wide).width == 2048


def test_projection_keeps_north_up_and_masks_stay_transparent():
    g = LatLonGrid(nx=4, ny=40, lat_north=30.0, lon_west=-80.0, dlat=0.5, dlon=0.5)
    values = np.repeat(np.arange(40, dtype=np.float32)[:, None], 4, axis=1)  # row index as value
    values[:, 0] = np.nan
    f = frame_for(g)
    out = project(values, g, f)
    assert np.isnan(out[:, 0]).all()
    col = out[:, 2]
    assert col[0] == 0 and col[-1] == 39  # northernmost row first, southernmost last
    assert (np.diff(col) >= 0).all()  # monotonic: nearest rows only, no interpolation


def test_render_encodes_display_units_into_bytes():
    g = LatLonGrid(nx=8, ny=8, lat_north=25.0, lon_west=-90.0, dlat=0.5, dlon=0.5)
    values = np.full((8, 8), 970.0, np.float32)
    values[0, 0] = np.nan
    png, frame = render(FIELDS['mslp'], values, g)
    b = read_png(png)
    assert b.shape == (frame.height, frame.width)
    assert b[0, 0] == 0
    decoded = decode_bytes(b, FIELDS['mslp'].lo, FIELDS['mslp'].hi)
    assert np.nanmax(np.abs(decoded - 970)) < 0.6  # one byte step is 130/254 hPa


def test_png_writer_is_the_shared_copy():
    with open(os.path.join(SERVICE_DIR, 'png.py'), encoding='utf-8') as a, \
            open(os.path.join(SERVICE_DIR, '..', 'weather-models', 'fields', 'png.py'), encoding='utf-8') as b:
        strip = lambda text: text.split('"""', 2)[2]  # noqa: E731 - the docstrings name their own paths
        assert strip(a.read()) == strip(b.read())


def test_png_rejects_wrong_dtype():
    with pytest.raises(ValueError):
        encode_png(np.zeros((2, 2), np.float32))
