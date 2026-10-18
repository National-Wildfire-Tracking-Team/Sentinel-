import datetime as dt

import numpy as np
import pytest

from glm import GlmError, read_flashes

START = dt.datetime(2026, 10, 18, 18, 49, 20, tzinfo=dt.timezone.utc)


def test_reads_good_flashes_with_unpacked_time_and_energy(glm):
    data = glm([
        (35.5, -97.5, 4.0, 2e-14, 0),
        (40.0, -100.0, 12.5, 5e-15, 0),
        (41.0, -101.0, 15.0, 5e-15, 1),  # degraded: dropped
    ])
    out = read_flashes(data)
    assert out['platform'] == 'G19'
    assert out['subLon'] == pytest.approx(-75.2)
    assert out['start'] == START.timestamp()
    assert out['end'] == START.timestamp() + 20
    np.testing.assert_allclose(out['lat'], [35.5, 40.0], atol=1e-5)
    np.testing.assert_allclose(out['lon'], [-97.5, -100.0], atol=1e-5)
    # int16 storage read as unsigned, then scale + offset (offsets above ~7.5 s are negative as int16)
    np.testing.assert_allclose(out['t'] - START.timestamp(), [4.0, 12.5], atol=1e-3)
    np.testing.assert_allclose(out['energy'], [2e-14, 5e-15], atol=1e-15)  # stored in ~1 fJ steps


def test_an_empty_file_has_no_flashes(glm):
    out = read_flashes(glm([]))
    assert len(out['lat']) == 0


def test_rejects_non_hdf5():
    with pytest.raises(GlmError):
        read_flashes(b'not a netcdf file')
