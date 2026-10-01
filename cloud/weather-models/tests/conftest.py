"""
Test fixtures: synthetic HRRR and GFS datasets in in-memory Icechunk repos.

They have the real datasets' layout — same variable names, dimension order,
coordinate encodings and grid geometry — but only a few runs and lead times,
and values only at the grid cells a test writes. Every other cell is the fill
value (NaN), exactly like a run that hasn't been ingested yet. No test
touches the network.
"""

from __future__ import annotations

import os
import sys

import icechunk
import numpy as np
import pytest
import zarr

SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVICE_DIR)

from providers import GFSProvider, HRRRProvider  # noqa: E402
from providers import gfs as gfs_grid  # noqa: E402
from providers import hrrr as hrrr_grid  # noqa: E402

HOUR = 3600
# 2026-10-01T12:00:00Z
T12Z = 1790856000

HRRR_VARS = sorted({v for vs in HRRRProvider.SOURCES.values() for v in vs})
GFS_VARS = sorted({v for vs in GFSProvider.SOURCES.values() for v in vs})


def _coord(group, name, data, dims, attrs=None):
    arr = group.create_array(name, shape=data.shape, dtype=data.dtype, dimension_names=dims, chunks=data.shape)
    arr[:] = data
    if attrs:
        arr.attrs.update(attrs)


def build_dataset(kind: str, *, init_times, lead_hours, expected_hours=None, cells=None, grid_override=None, blocks=None):
    """Create an in-memory Icechunk repo shaped like the real dataset.

    cells: {(iy, ix): fn(run_pos, var, lead_seconds) -> 1-D array or None}
    blocks: {(iy, ix, half_size): fn} — the same series over a square of cells (for map fields)
    Returns the Icechunk Storage, ready to hand to a provider.
    """
    storage = icechunk.in_memory_storage()
    repo = icechunk.Repository.create(storage)
    session = repo.writable_session('main')
    root = zarr.group(store=session.store)

    init_times = np.asarray(init_times, dtype='int64')
    lead_seconds = np.asarray(lead_hours, dtype='float64') * HOUR
    expected = np.full(init_times.shape, (expected_hours if expected_hours is not None else lead_hours[-1]) * HOUR,
                       dtype='float64')

    _coord(root, 'init_time', init_times, ['init_time'])
    _coord(root, 'lead_time', lead_seconds, ['lead_time'])
    _coord(root, 'expected_forecast_length', expected, ['init_time'])

    if kind == 'hrrr':
        g = grid_override or {}
        x = g.get('x0', hrrr_grid.X0) + np.arange(hrrr_grid.NX) * hrrr_grid.DX
        y = hrrr_grid.Y0 + np.arange(hrrr_grid.NY) * hrrr_grid.DY
        _coord(root, 'x', x, ['x'])
        _coord(root, 'y', y, ['y'])
        spatial = ('y', 'x')
        shape = (hrrr_grid.NY, hrrr_grid.NX)
        variables = HRRR_VARS
    else:
        lat = gfs_grid.LAT_START - np.arange(gfs_grid.NLAT) * gfs_grid.STEP
        lon = gfs_grid.LON_START + np.arange(gfs_grid.NLON) * gfs_grid.STEP
        _coord(root, 'latitude', lat, ['latitude'])
        _coord(root, 'longitude', lon, ['longitude'])
        spatial = ('latitude', 'longitude')
        shape = (gfs_grid.NLAT, gfs_grid.NLON)
        variables = GFS_VARS

    full_shape = (len(init_times), len(lead_seconds), *shape)
    arrays = {}
    for var in variables:
        arrays[var] = root.create_array(
            var, shape=full_shape, dtype='float32', fill_value=np.nan,
            chunks=(1, len(lead_seconds), 128, 128), dimension_names=['init_time', 'lead_time', *spatial],
        )

    for (iy, ix), fn in (cells or {}).items():
        for run_pos in range(len(init_times)):
            for var in variables:
                values = fn(run_pos, var, lead_seconds)
                if values is not None:
                    arrays[var][run_pos, :, iy, ix] = np.asarray(values, dtype='float32')

    for (iy, ix, half), fn in (blocks or {}).items():
        y0, y1 = max(0, iy - half), min(shape[0], iy + half + 1)
        x0, x1 = max(0, ix - half), min(shape[1], ix + half + 1)
        for run_pos in range(len(init_times)):
            for var in variables:
                values = fn(run_pos, var, lead_seconds)
                if values is not None:
                    block = np.broadcast_to(np.asarray(values, dtype='float32')[:, None, None],
                                            (len(lead_seconds), y1 - y0, x1 - x0))
                    arrays[var][run_pos, :, y0:y1, x0:x1] = np.ascontiguousarray(block)

    session.commit('test fixture')
    return storage


def constant_cell(overrides=None, missing_after=None, missing_runs=()):
    """A cell with plausible constant values; tweak per variable / run.

    missing_after: {run_pos: n} — leads from n on are NaN (run still ingesting)
    missing_runs: run positions with no data at all at this cell
    """
    base = {
        'temperature_2m': 20.0,  # °C
        'dew_point_temperature_2m': 5.0,
        'relative_humidity_2m': 30.0,
        'wind_u_10m': 0.0,
        'wind_v_10m': -5.0,  # blowing toward the south = from the north
        'wind_gust_surface': 9.0,
        'precipitation_surface': 1.0 / 3600,  # 1 mm/h
        'pressure_surface': 95000.0,
        'pressure_reduced_to_mean_sea_level': 101325.0,
        'total_cloud_cover_atmosphere': 50.0,
    }
    base.update(overrides or {})
    missing_after = missing_after or {}

    def fn(run_pos, var, lead_seconds):
        if run_pos in missing_runs:
            return None
        value = base[var]
        series = np.array([value(run_pos, i) if callable(value) else value for i in range(len(lead_seconds))],
                          dtype='float64')
        if var == 'precipitation_surface':
            series[0] = np.nan  # like the real data: no preceding step at lead 0
        cut = missing_after.get(run_pos)
        if cut is not None:
            series[cut:] = np.nan
        return series

    return fn


# Reference cells, verified against the real datasets' 2-D lat/lon arrays.
LA = (34.05, -118.25)
LA_HRRR_CELL = (622, 265)
LA_GFS_CELL = (224, 247)
HONOLULU = (21.3, -157.85)
HONOLULU_GFS_CELL = (275, 89)


@pytest.fixture
def hrrr_storage_factory():
    return lambda **kw: build_dataset('hrrr', **kw)


@pytest.fixture
def gfs_storage_factory():
    return lambda **kw: build_dataset('gfs', **kw)


class FixedClock:
    def __init__(self, now):
        self.now = now

    def __call__(self):
        return self.now
