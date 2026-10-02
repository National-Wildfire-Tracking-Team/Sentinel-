"""
grids.py
The Web Mercator output grid for MRMS frames, and the max-pool resampler
from MRMS's regular lat/lon grids onto it.

Frames are Web Mercator rasters (rows evenly spaced in Mercator y), so Mapbox
draws each as a plain image quad between four corners, the same as the Models
tab's frames (cloud/weather-models/fields/grids.py).

Why max-pooling and not bilinear: a frame is coarser than the 1 km (or 500 m)
source, and the things worth seeing are small peaks (a hail core, a rotation
track, a 60 dBZ cell). Averaging would dilute them; the block maximum keeps
them. It runs on the raw packed integers, which is valid because the
GRIB2 scaling is monotonic, and because MRMS's "no coverage" values are the
lowest in every product, a block that's partly covered takes its covered value.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from grib2 import LatLonGrid

# The MRMS CONUS domain's outer edges (both the 0.01° and the 0.005° grids).
CONUS_BOUNDS = (-130.0, 20.0, -60.0, 55.0)


def merc_y(lat_deg):
    return np.log(np.tan(np.pi / 4 + np.radians(lat_deg) / 2))


def inv_merc_y(y):
    return np.degrees(np.arctan(np.sinh(y)))


@dataclass(frozen=True)
class OutputGrid:
    west: float
    south: float
    east: float
    north: float
    width: int

    @property
    def height(self) -> int:
        span_x = math.radians(self.east - self.west)
        span_y = float(merc_y(self.north) - merc_y(self.south))
        return max(1, round(self.width * span_y / span_x))

    @property
    def bounds(self) -> list[float]:
        return [self.west, self.south, self.east, self.north]

    @property
    def coordinates(self) -> list[list[float]]:
        """Mapbox image-source corners: top-left, top-right, bottom-right, bottom-left."""
        return [[self.west, self.north], [self.east, self.north], [self.east, self.south], [self.west, self.south]]

    def row_edges_lat(self) -> np.ndarray:
        """Latitudes of the height+1 row edges, north to south."""
        y_n, y_s = merc_y(self.north), merc_y(self.south)
        return inv_merc_y(y_n - np.arange(self.height + 1) / self.height * (y_n - y_s))

    def col_edges_lon(self) -> np.ndarray:
        return self.west + np.arange(self.width + 1) / self.width * (self.east - self.west)


def conus_grid(width: int) -> OutputGrid:
    return OutputGrid(*CONUS_BOUNDS, width)


@dataclass(frozen=True)
class PoolPlan:
    """Source index groups for each output row and column (for np.maximum.reduceat)."""

    row_starts: np.ndarray
    row_end: int
    row_valid: np.ndarray
    col_starts: np.ndarray
    col_end: int
    col_valid: np.ndarray


def _groups(first_centre: float, step: float, n: int, edges: np.ndarray):
    """For each output cell between consecutive `edges` (in the source's index direction),
    the first source index whose centre falls inside it.

    Source centre k is first_centre + k*step (step may be negative). An output
    cell finer than the source gets the one source cell its start lands in.
    """
    pos = (edges - first_centre) / step  # fractional source index of each edge
    starts = np.ceil(pos[:-1] - 1e-9).astype('int64')
    ends = np.ceil(pos[1:] - 1e-9).astype('int64')
    empty = ends <= starts
    # Cells with no source centre inside take the source cell containing their middle.
    middle = np.floor((pos[:-1] + pos[1:]) / 2 + 0.5).astype('int64')
    starts = np.where(empty, middle, starts)
    valid = (starts >= 0) & (starts < n)
    starts = np.clip(starts, 0, n - 1)
    # reduceat needs non-decreasing starts; the last group runs to `end`.
    starts = np.maximum.accumulate(starts)
    end = int(np.clip(max(ends[-1], starts[-1] + 1), 1, n))
    return starts, end, valid


@lru_cache(maxsize=16)
def pool_plan(src: LatLonGrid, out: OutputGrid) -> PoolPlan:
    rows, row_end, row_valid = _groups(src.lat1, -src.dlat, src.ny, out.row_edges_lat())
    cols, col_end, col_valid = _groups(src.lon1, src.dlon, src.nx, out.col_edges_lon())
    return PoolPlan(rows, row_end, row_valid, cols, col_end, col_valid)


def max_pool(packed: np.ndarray, src: LatLonGrid, out: OutputGrid) -> tuple[np.ndarray, np.ndarray]:
    """Block maximum of `packed` (ny, nx) onto `out`.

    Returns (values (H, W) same dtype, inside (H, W) bool: the output pixel lies within the source grid).
    """
    plan = pool_plan(src, out)
    a = np.maximum.reduceat(packed[:plan.row_end], plan.row_starts, axis=0)
    a = np.maximum.reduceat(a[:, :plan.col_end], plan.col_starts, axis=1)
    inside = plan.row_valid[:, None] & plan.col_valid[None, :]
    return a, inside
