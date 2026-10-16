"""
render.py
A decoded HAFS field (regular lat/lon grid, north row first) → a Web Mercator
image frame that Mapbox draws as an image source between four corners, the
same frame shape the Models tab and MRMS use.

Projection. Columns are evenly spaced in longitude in both the model grid
and Web Mercator, so they map straight across. Rows are evenly spaced in
latitude in the model grid but must be evenly spaced in Mercator y in the
frame, so each frame row takes the model row nearest its centre latitude.
Nearest-neighbour (not interpolation) keeps the model's own values and its
bitmap edge: the storm nest is a moving box with roughly half its points
masked, and those stay transparent instead of smearing into the field.

The frame keeps the native resolution (one column per model column, up to
MAX_WIDTH), so nothing is downsampled for the storm nest (1001 columns at
0.02°) and the parent domain (1681 at 0.06°) keeps its detail too.

Grids that cross the antimeridian (West Pacific parents) keep a continuous
longitude range, so `east` can exceed 180; Mapbox draws image corners past
180° on the adjacent world copy.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from fields import HafsField, encode_bytes
from grib2 import LatLonGrid
from png import encode_png

MAX_WIDTH = 2048
MAX_LAT = 85.0


def merc_y(lat_deg):
    return np.log(np.tan(np.pi / 4 + np.radians(lat_deg) / 2))


def inv_merc_y(y):
    return np.degrees(np.arctan(np.sinh(y)))


@dataclass(frozen=True)
class Frame:
    west: float
    south: float
    east: float
    north: float
    width: int
    height: int

    @property
    def coordinates(self) -> list[list[float]]:
        """Mapbox image-source corners: top-left, top-right, bottom-right, bottom-left."""
        r = lambda v: round(v, 6)  # noqa: E731
        return [[r(self.west), r(self.north)], [r(self.east), r(self.north)],
                [r(self.east), r(self.south)], [r(self.west), r(self.south)]]

    def to_api(self) -> dict:
        return {'coordinates': self.coordinates, 'bounds': [round(v, 6) for v in (self.west, self.south, self.east, self.north)],
                'size': [self.width, self.height]}


def frame_for(grid: LatLonGrid, max_width: int = MAX_WIDTH) -> Frame:
    west, south, east, north = grid.bounds
    north, south = min(north, MAX_LAT), max(south, -MAX_LAT)
    width = min(grid.nx, max_width)
    span_x = math.radians(east - west)
    span_y = float(merc_y(north) - merc_y(south))
    height = max(1, round(width * span_y / span_x))
    return Frame(west, south, east, north, width, height)


def project(values: np.ndarray, grid: LatLonGrid, frame: Frame) -> np.ndarray:
    """Nearest-neighbour resample of `values` (ny, nx, north first) onto the Mercator frame. NaN outside the grid."""
    yn, ys = merc_y(frame.north), merc_y(frame.south)
    centres_y = yn - (np.arange(frame.height) + 0.5) / frame.height * (yn - ys)
    lat = inv_merc_y(centres_y)
    rows = np.rint((grid.lat_north - lat) / grid.dlat).astype(np.int64)
    lon = frame.west + (np.arange(frame.width) + 0.5) / frame.width * (frame.east - frame.west)
    cols = np.rint((lon - grid.lon_west) / grid.dlon).astype(np.int64)
    row_ok = (rows >= 0) & (rows < grid.ny)
    col_ok = (cols >= 0) & (cols < grid.nx)
    out = values[np.clip(rows, 0, grid.ny - 1)][:, np.clip(cols, 0, grid.nx - 1)]
    out = out.astype(np.float32, copy=True)
    out[~row_ok, :] = np.nan
    out[:, ~col_ok] = np.nan
    return out


def render(field: HafsField, values: np.ndarray, grid: LatLonGrid) -> tuple[bytes, Frame]:
    """Field values on the model grid → (PNG bytes, frame corners)."""
    frame = frame_for(grid)
    projected = project(values, grid, frame)
    return encode_png(encode_bytes(projected, field.lo, field.hi, field.transform)), frame
