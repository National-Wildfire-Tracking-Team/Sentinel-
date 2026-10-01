"""
fields/grids.py
Output grids for map fields, and the lookup tables that resample a model's
native grid onto them.

Every field image is a Web Mercator raster: pixel rows are evenly spaced in
Mercator y, so Mapbox can draw the image as a plain quad between its four
corner coordinates and every pixel lands where its value belongs.

The lookup table (LUT) is built once per process: for each output pixel, the
four surrounding source cells and bilinear weights. Resampling a frame is then
four gathers and a weighted sum (~30 ms for a full HRRR frame), with no
per-frame projection math.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from providers import gfs as gfs_grid
from providers import hrrr as hrrr_grid


def merc_y(lat_deg):
    lat = np.radians(lat_deg)
    return np.log(np.tan(np.pi / 4 + lat / 2))


def inv_merc_y(y):
    return np.degrees(np.arctan(np.sinh(y)))


@dataclass(frozen=True)
class OutputGrid:
    """A Web Mercator raster covering [west, south, east, north]."""

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

    def pixel_lonlat(self):
        """(lat, lon) of every pixel centre, each shaped (height, width)."""
        cols = (np.arange(self.width) + 0.5) / self.width
        rows = (np.arange(self.height) + 0.5) / self.height
        lon = self.west + cols * (self.east - self.west)
        y_n, y_s = merc_y(self.north), merc_y(self.south)
        lat = inv_merc_y(y_n - rows * (y_n - y_s))
        lon2d, lat2d = np.meshgrid(lon, lat)
        return lat2d, lon2d

    def downsampled(self, factor: int) -> OutputGrid:
        return OutputGrid(self.west, self.south, self.east, self.north, max(1, self.width // factor))


@dataclass
class Lut:
    """Bilinear resampling from a source grid (ny, nx) to an OutputGrid."""

    grid: OutputGrid
    idx: np.ndarray  # (4, H*W) int64 flat source indices
    weights: np.ndarray  # (4, H*W) float32
    valid: np.ndarray  # (H*W,) bool — inside the source grid
    lon: np.ndarray  # (H, W) pixel longitudes (for wind rotation)

    def resample(self, frame: np.ndarray) -> np.ndarray:
        """frame: (ny, nx) source values → (H, W) float32; NaN outside the source or where data is missing."""
        flat = frame.reshape(-1)
        out = (flat[self.idx[0]] * self.weights[0] + flat[self.idx[1]] * self.weights[1]
               + flat[self.idx[2]] * self.weights[2] + flat[self.idx[3]] * self.weights[3])
        out = np.where(self.valid, out, np.nan).astype('float32')
        return out.reshape(self.grid.height, self.grid.width)


def _bilinear_lut(grid: OutputGrid, fy: np.ndarray, fx: np.ndarray, ny: int, nx: int, lon: np.ndarray) -> Lut:
    fy = fy.reshape(-1)
    fx = fx.reshape(-1)
    valid = (fy >= 0) & (fy <= ny - 1) & (fx >= 0) & (fx <= nx - 1)
    fy = np.clip(fy, 0, ny - 1)
    fx = np.clip(fx, 0, nx - 1)
    i0 = np.minimum(np.floor(fy).astype('int64'), ny - 2)
    j0 = np.minimum(np.floor(fx).astype('int64'), nx - 2)
    wy = (fy - i0).astype('float32')
    wx = (fx - j0).astype('float32')
    idx = np.stack([i0 * nx + j0, i0 * nx + j0 + 1, (i0 + 1) * nx + j0, (i0 + 1) * nx + j0 + 1])
    weights = np.stack([(1 - wy) * (1 - wx), (1 - wy) * wx, wy * (1 - wx), wy * wx]).astype('float32')
    return Lut(grid, idx, weights, valid, lon)


# ── HRRR (Lambert conformal) ──

def _hrrr_project(lat, lon):
    """Vectorized providers.hrrr.project."""
    phi = np.radians(lat)
    rho = hrrr_grid.EARTH_RADIUS_M * hrrr_grid._F / np.tan(np.pi / 4 + phi / 2) ** hrrr_grid._N
    theta = hrrr_grid._N * np.radians(lon - hrrr_grid.LON_0)
    return rho * np.sin(theta), hrrr_grid._RHO0 - rho * np.cos(theta)


def hrrr_output_grid(width: int = 1800) -> OutputGrid:
    ring = np.array(_hrrr_outline())
    return OutputGrid(
        west=math.floor(ring[:, 0].min() * 10) / 10, south=math.floor(ring[:, 1].min() * 10) / 10,
        east=math.ceil(ring[:, 0].max() * 10) / 10, north=math.ceil(ring[:, 1].max() * 10) / 10,
        width=width,
    )


def _hrrr_outline():
    xs = [hrrr_grid.X0 + i * hrrr_grid.DX for i in range(hrrr_grid.NX)]
    ys = [hrrr_grid.Y0 + j * hrrr_grid.DY for j in range(hrrr_grid.NY)]
    edge = [(x, ys[0]) for x in xs] + [(x, ys[-1]) for x in xs] + [(xs[0], y) for y in ys] + [(xs[-1], y) for y in ys]
    return [(lon, lat) for lat, lon in (hrrr_grid.unproject(x, y) for x, y in edge)]


def hrrr_lut(grid: OutputGrid) -> Lut:
    lat, lon = grid.pixel_lonlat()
    x, y = _hrrr_project(lat, lon)
    fx = (x - hrrr_grid.X0) / hrrr_grid.DX
    fy = (y - hrrr_grid.Y0) / hrrr_grid.DY
    return _bilinear_lut(grid, fy, fx, hrrr_grid.NY, hrrr_grid.NX, lon)


def hrrr_rotation(lon: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """cos/sin of the grid→true-north rotation at each pixel (see HRRRProvider.earth_relative_wind)."""
    angle = hrrr_grid._N * np.radians(lon - hrrr_grid.LON_0)
    return np.cos(angle).astype('float32'), np.sin(angle).astype('float32')


# ── GFS (regular 0.25° lat/lon), North America + Hawaii/Pacific subset ──

GFS_REGION = {'south': 10.0, 'north': 75.0, 'west': -180.0, 'east': -50.0}
# Source rows/cols of that region in the global grid (latitude runs 90 → -90).
GFS_ROWS = slice(round((gfs_grid.LAT_START - GFS_REGION['north']) / gfs_grid.STEP),
                 round((gfs_grid.LAT_START - GFS_REGION['south']) / gfs_grid.STEP) + 1)
GFS_COLS = slice(round((GFS_REGION['west'] - gfs_grid.LON_START) / gfs_grid.STEP),
                 round((GFS_REGION['east'] - gfs_grid.LON_START) / gfs_grid.STEP) + 1)


def gfs_output_grid(width: int = 1040) -> OutputGrid:
    return OutputGrid(GFS_REGION['west'], GFS_REGION['south'], GFS_REGION['east'], GFS_REGION['north'], width)


def gfs_lut(grid: OutputGrid) -> Lut:
    """Resample the GFS *subset* (rows GFS_ROWS, cols GFS_COLS) onto any output grid."""
    lat, lon = grid.pixel_lonlat()
    fy = (GFS_REGION['north'] - lat) / gfs_grid.STEP
    fx = (lon - GFS_REGION['west']) / gfs_grid.STEP
    ny = GFS_ROWS.stop - GFS_ROWS.start
    nx = GFS_COLS.stop - GFS_COLS.start
    return _bilinear_lut(grid, fy, fx, ny, nx, lon)
