import numpy as np
import pytest

import grids
from grib2 import LatLonGrid

SRC = LatLonGrid(nx=7000, ny=3500, lat1=54.995, lon1=-129.995, dlat=0.01, dlon=0.01)


def test_output_grid_matches_the_conus_domain():
    g = grids.conus_grid(2048)
    assert g.bounds == [-130.0, 20.0, -60.0, 55.0]
    assert g.coordinates[0] == [-130.0, 55.0] and g.coordinates[2] == [-60.0, 20.0]
    assert 1300 < g.height < 1400  # Mercator: taller at the north edge than an equirectangular grid


def test_max_pool_keeps_a_single_cell_peak():
    packed = np.zeros((SRC.ny, SRC.nx), np.uint16)
    packed[1234, 4321] = 777  # one 1 km cell
    out, inside = grids.max_pool(packed, SRC, grids.conus_grid(1024))
    assert out.max() == 777 and (out == 777).sum() == 1
    assert inside.all()


def test_max_pool_puts_values_where_they_belong():
    # A peak at 40°N, 100°W lands in the output pixel containing that point.
    packed = np.zeros((SRC.ny, SRC.nx), np.uint16)
    row, col = round((54.995 - 40.0) / 0.01), round((-100.0 + 129.995) / 0.01)
    packed[row, col] = 5
    g = grids.conus_grid(2048)
    out, _ = grids.max_pool(packed, SRC, g)
    r, c = np.argwhere(out == 5)[0]
    lat_edges, lon_edges = g.row_edges_lat(), g.col_edges_lon()
    assert lat_edges[r + 1] <= 40.0 <= lat_edges[r]
    assert lon_edges[c] <= -100.0 <= lon_edges[c + 1]


def test_finer_output_than_source_still_covers_every_pixel():
    coarse = LatLonGrid(nx=70, ny=35, lat1=54.5, lon1=-129.5, dlat=1.0, dlon=1.0)
    packed = np.arange(70 * 35, dtype=np.uint16).reshape(35, 70)
    out, inside = grids.max_pool(packed, coarse, grids.conus_grid(140))
    assert inside.all()
    assert out[0, 0] == packed[0, 0] and out[-1, -1] == packed[-1, -1]
    assert np.all(np.diff(out[:, 0].astype(int)) >= 0)  # rows run north → south


def test_rotation_track_grid_has_the_same_extent():
    fine = LatLonGrid(nx=14000, ny=7000, lat1=54.9975, lon1=-129.9975, dlat=0.005, dlon=0.005)
    assert fine.bounds == pytest.approx(grids.CONUS_BOUNDS)
    assert SRC.bounds == pytest.approx(grids.CONUS_BOUNDS)
