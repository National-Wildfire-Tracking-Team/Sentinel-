"""Shared fixtures: the service directory on sys.path, and synthetic GLM-L2-LCFA files.

`make_glm` writes the flash variables the way NOAA does (packed unsigned int16
with scale/offset, time offsets "seconds since" the file start), so tests run offline.
"""

import datetime as dt
import io
import os
import sys

import h5py
import numpy as np
import pytest

SERVICE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, SERVICE_DIR)

TIME_SCALE = 0.00038148
TIME_OFFSET = -5.0
ENERGY_SCALE = 9.99996e-16
ENERGY_OFFSET = 2.8515e-16


def _packed(f, name, values, scale, offset, units):
    raw = np.round((np.asarray(values, dtype=np.float64) - offset) / scale).astype(np.uint16).view(np.int16)
    ds = f.create_dataset(name, data=raw)
    ds.attrs['scale_factor'] = np.array([scale], dtype=np.float32)
    ds.attrs['add_offset'] = np.array([offset], dtype=np.float32)
    ds.attrs['_Unsigned'] = np.bytes_(b'true')
    ds.attrs['units'] = np.bytes_(units.encode())


def make_glm(flashes, *, start=dt.datetime(2026, 10, 18, 18, 49, 20, tzinfo=dt.timezone.utc), platform='G19', sub_lon=-75.2):
    """flashes: [(lat, lon, seconds after start, energy J, quality flag)]"""
    lat, lon, sec, energy, quality = (list(c) for c in zip(*flashes)) if flashes else ([], [], [], [], [])
    buf = io.BytesIO()
    with h5py.File(buf, 'w') as f:
        f.create_dataset('flash_lat', data=np.asarray(lat, dtype=np.float32))
        f.create_dataset('flash_lon', data=np.asarray(lon, dtype=np.float32))
        _packed(f, 'flash_time_offset_of_first_event', sec, TIME_SCALE, TIME_OFFSET,
                f'seconds since {start:%Y-%m-%d %H:%M:%S}.000')
        _packed(f, 'flash_energy', energy, ENERGY_SCALE, ENERGY_OFFSET, 'J')
        q = f.create_dataset('flash_quality_flag', data=np.asarray(quality, dtype=np.int16))
        q.attrs['_Unsigned'] = np.bytes_(b'true')
        f.create_dataset('nominal_satellite_subpoint_lon', data=np.float32(sub_lon))
        end = start + dt.timedelta(seconds=20)
        f.attrs['time_coverage_start'] = np.bytes_(f'{start:%Y-%m-%dT%H:%M:%S}.0Z'.encode())
        f.attrs['time_coverage_end'] = np.bytes_(f'{end:%Y-%m-%dT%H:%M:%S}.0Z'.encode())
        f.attrs['platform_ID'] = np.bytes_(platform.encode())
    return buf.getvalue()


@pytest.fixture
def glm():
    return make_glm
