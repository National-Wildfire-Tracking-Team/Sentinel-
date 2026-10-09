import numpy as np
import pytest
from conftest import make_grib

from grib2 import UnsupportedGrib, decode, read_grid


def field(ny=9, nx=13, seed=0):
    rng = np.random.default_rng(seed)
    # Smooth plus noise, both signs, one decimal (D = 1 keeps exactly that).
    yy, xx = np.mgrid[0:ny, 0:nx]
    return np.round(50 * np.sin(yy / 3) + 30 * np.cos(xx / 4) + rng.normal(0, 5, (ny, nx)), 1)


@pytest.mark.parametrize('template', [0, 3])
@pytest.mark.parametrize('group', [1, 5, 64])
def test_round_trip_without_bitmap(template, group):
    values = field()
    out = decode(make_grib(values, template=template, group=group, bitmap=False))
    np.testing.assert_allclose(out.values, values, atol=1e-3)
    assert out.values.dtype == np.float32


@pytest.mark.parametrize('template', [0, 3])
def test_bitmap_points_come_back_as_nan(template):
    values = field()
    values[:3, :4] = np.nan  # the storm nest's masked corner
    values[7, 10] = np.nan
    out = decode(make_grib(values, template=template))
    assert np.array_equal(np.isnan(out.values), np.isnan(values))
    np.testing.assert_allclose(out.values[~np.isnan(values)], values[~np.isnan(values)], atol=1e-3)


def test_rows_are_returned_north_first_and_grid_matches_corners():
    values = np.zeros((5, 4))
    values[0, :] = 99  # north row
    out = decode(make_grib(values, lat_south=10.0, lon_west=280.0, step=0.5, bitmap=False))
    assert out.values[0].tolist() == [99] * 4 and out.values[-1].tolist() == [0] * 4
    g = out.grid
    assert (g.nx, g.ny) == (4, 5)
    assert g.lat_north == pytest.approx(12.0) and g.lat_south == pytest.approx(10.0)
    assert g.lon_west == pytest.approx(-80.0) and g.dlon == pytest.approx(0.5)
    assert g.bounds == pytest.approx((-80.25, 9.75, -78.25, 12.25))


def test_reference_time_and_parameter():
    out = decode(make_grib(field(), ref_time=(2026, 10, 8, 18), category=3, parameter=1, bitmap=False))
    assert out.reference_time.isoformat() == '2026-10-08T18:00:00+00:00'
    assert (out.category, out.parameter) == (3, 1)


def test_read_grid_needs_only_the_head():
    msg = make_grib(field(), lat_south=20.0, lon_west=270.0, step=0.02, bitmap=False)
    assert read_grid(msg[:512]) == decode(msg).grid


@pytest.mark.parametrize('mutate, message', [
    (lambda m: b'GRIB' + m[4:7] + b'\x01' + m[8:], 'edition 2'),
    (lambda m: m[:-40], 'truncated'),
    (lambda m: m[:-4] + b'XXXX', 'corrupt|end marker'),
])
def test_corrupt_messages_raise(mutate, message):
    with pytest.raises(UnsupportedGrib, match=message):
        decode(mutate(make_grib(field(), bitmap=False)))


def test_two_messages_in_one_range_are_refused():
    msg = make_grib(field(), bitmap=False)
    with pytest.raises(UnsupportedGrib):
        decode(msg[:-4] + msg[16:])  # sections 3-7 twice, as if two idx entries were fetched in one range


def test_unsupported_packing_template_is_refused():
    msg = bytearray(make_grib(field(), template=0, bitmap=False))
    pos = 16
    while msg[pos + 4] != 5:  # walk to section 5
        pos += int.from_bytes(msg[pos:pos + 4], 'big')
    msg[pos + 9:pos + 11] = (40).to_bytes(2, 'big')  # template 5.40 (JPEG 2000)
    with pytest.raises(UnsupportedGrib, match='5.40'):
        decode(bytes(msg))
