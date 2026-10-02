import datetime as dt

import numpy as np
import pytest

from grib2 import UnsupportedGrib, decode


def test_decodes_png_packed_field(grib):
    packed = np.array([[0, 900, 1000], [1100, 1600, 0]], dtype=np.uint16)
    f = decode(grib(packed, lat1=54.995, lon1=230.005, step=0.01))
    assert f.reference_time == dt.datetime(2026, 10, 2, 0, 46, 38, tzinfo=dt.timezone.utc)
    assert f.grid.nx == 3 and f.grid.ny == 2
    assert f.grid.lon1 == pytest.approx(-129.995)
    assert f.grid.bounds == pytest.approx((-130.0, 54.98, -129.97, 55.0))
    # (R + X·2^E) / 10^D with R = -9990, D = 1
    np.testing.assert_allclose(f.to_physical(), [[-999, -909, -899], [-889, -839, -999]])
    assert (f.category, f.parameter, f.discipline) == (10, 0, 209)


def test_negative_scale_factors_are_sign_and_magnitude(grib):
    f = decode(grib(np.array([[0, 10]], dtype=np.uint8), R=-3.0, E=-1, D=0))
    assert f.binary_scale == -1
    np.testing.assert_allclose(f.to_physical(), [[-3.0, 2.0]])


def test_uncompressed_input(grib):
    assert decode(grib(np.zeros((2, 2), np.uint8), gz=False)).packed.shape == (2, 2)


@pytest.mark.parametrize('kwargs, match', [
    ({'template5': 0}, 'PNG packing'),
    ({'scan': 0x40}, 'scanning mode'),
])
def test_rejects_shapes_it_does_not_handle(grib, kwargs, match):
    with pytest.raises(UnsupportedGrib, match=match):
        decode(grib(np.zeros((2, 2), np.uint8), **kwargs))


def test_rejects_truncated_and_foreign_files(grib):
    data = grib(np.zeros((2, 2), np.uint8), gz=False)
    with pytest.raises(UnsupportedGrib):
        decode(data[:-10])
    with pytest.raises(UnsupportedGrib):
        decode(b'not a grib file at all')
