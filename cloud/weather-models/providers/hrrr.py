"""
providers/hrrr.py
NOAA HRRR (High-Resolution Rapid Refresh), 3 km, CONUS, from
s3://dynamical-noaa-hrrr/noaa-hrrr-forecast-48-hour (dynamical.org).

This dataset holds the 48-hour runs only: 00, 06, 12 and 18 UTC, hourly
lead times 0-48 h. The hourly HRRR runs that only go out 18 h are a separate
dataset (noaa-hrrr-forecast-18-hour-virtual) and aren't used here.

The grid is Lambert conformal conic, so a lat/lon is converted to grid x/y
with the projection itself — no need to download the 8 MB 2-D latitude and
longitude arrays — and the u/v winds, which are along the grid's x/y axes
rather than east/north, are rotated to true north before any direction is
computed.
"""

from __future__ import annotations

import math

import numpy as np

from .base import DatasetError, GridPoint, OutOfDomainError, WeatherModelProvider

# Projection and grid from the dataset's spatial_ref (crs_wkt) and x/y
# coordinates, dataset version 0.1.0. validate_grid() re-checks them on every
# new snapshot so a regridded dataset fails loudly instead of returning the
# wrong cell.
EARTH_RADIUS_M = 6371229.0
LAT_0 = 38.5  # latitude of origin = both standard parallels (tangent cone)
LON_0 = -97.5  # central meridian
X0, DX, NX = -2697520.142521929, 3000.0, 1799
Y0, DY, NY = 1586693.847443335, -3000.0, 1059

_PHI0 = math.radians(LAT_0)
_N = math.sin(_PHI0)
_F = math.cos(_PHI0) * math.tan(math.pi / 4 + _PHI0 / 2) ** _N / _N
_RHO0 = EARTH_RADIUS_M * _F / math.tan(math.pi / 4 + _PHI0 / 2) ** _N


def project(lat: float, lon: float) -> tuple[float, float]:
    """lat/lon (degrees) -> HRRR Lambert x/y (metres)."""
    phi = math.radians(lat)
    rho = EARTH_RADIUS_M * _F / math.tan(math.pi / 4 + phi / 2) ** _N
    theta = _N * math.radians(lon - LON_0)
    return rho * math.sin(theta), _RHO0 - rho * math.cos(theta)


def unproject(x: float, y: float) -> tuple[float, float]:
    """HRRR Lambert x/y (metres) -> lat/lon (degrees)."""
    dy = _RHO0 - y
    rho = math.copysign(math.hypot(x, dy), _N)
    theta = math.atan2(x, dy)
    lat = math.degrees(2 * math.atan((EARTH_RADIUS_M * _F / rho) ** (1 / _N)) - math.pi / 2)
    lon = LON_0 + math.degrees(theta / _N)
    return lat, lon


class HRRRProvider(WeatherModelProvider):
    id = 'hrrr'
    name = 'HRRR'
    full_name = 'High-Resolution Rapid Refresh'
    resolution = '3 km'
    domain = 'Continental United States'

    bucket = 'dynamical-noaa-hrrr'
    prefix = 'noaa-hrrr-forecast-48-hour/v0.1.0.icechunk'
    dataset_id = 'noaa-hrrr-forecast-48-hour'
    dataset_version = '0.1.0'
    attribution = 'NOAA NWS NCEP HRRR data processed by dynamical.org from NOAA Open Data Dissemination archives.'

    max_forecast_hours = 48
    default_forecast_hours = 48
    # 48-hour runs appear ~2 h after init and come every 6 h, so a healthy
    # newest run is at most ~8 h old.
    stale_after_hours = 12
    max_age_hours = 24

    SOURCES = {
        'temperature': ('temperature_2m',),
        'dewPoint': ('dew_point_temperature_2m',),
        'relativeHumidity': ('relative_humidity_2m',),
        'windSpeed': ('wind_u_10m', 'wind_v_10m'),
        'windDirection': ('wind_u_10m', 'wind_v_10m'),
        'windGust': ('wind_gust_surface',),
        'precipitationRate': ('precipitation_surface',),
        'precipitationAmount': ('precipitation_surface',),
        'pressureSurface': ('pressure_surface',),
        'pressureMsl': ('pressure_reduced_to_mean_sea_level',),
        'cloudCover': ('total_cloud_cover_atmosphere',),
        'compositeReflectivity': ('composite_reflectivity',),
    }

    def locate(self, lat: float, lon: float) -> GridPoint:
        x, y = project(lat, lon)
        ix = round((x - X0) / DX)
        iy = round((y - Y0) / DY)
        if not (0 <= ix < NX and 0 <= iy < NY):
            raise OutOfDomainError(f'({lat:.4f}, {lon:.4f}) is outside the HRRR CONUS domain')
        cell_lat, cell_lon = unproject(X0 + ix * DX, Y0 + iy * DY)
        return GridPoint(iy=iy, ix=ix, lat=cell_lat, lon=cell_lon)

    def earth_relative_wind(self, u, v, point):
        # Grid-relative -> earth-relative for a Lambert grid (NCEP/wgrib2):
        # the grid's y axis is rotated from true north by n·(lon - lon0).
        angle = _N * math.radians(point.lon - LON_0)
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        return cos_a * u + sin_a * v, -sin_a * u + cos_a * v

    def domain_geojson(self) -> dict:
        # Walk the grid's outer edge and unproject it: the coverage outline
        # the frontend draws, so "outside HRRR" is visible before a request.
        step = 60
        xs = [X0 + i * DX for i in range(0, NX, step)] + [X0 + (NX - 1) * DX]
        ys = [Y0 + j * DY for j in range(0, NY, step)] + [Y0 + (NY - 1) * DY]
        edge = (
            [(x, ys[0]) for x in xs]
            + [(xs[-1], y) for y in ys[1:]]
            + [(x, ys[-1]) for x in reversed(xs[:-1])]
            + [(xs[0], y) for y in reversed(ys[:-1])]
        )
        ring = []
        for x, y in edge:
            lat, lon = unproject(x, y)
            ring.append([round(lon, 3), round(lat, 3)])
        ring.append(ring[0])
        return {'type': 'Polygon', 'coordinates': [ring]}

    def validate_grid(self, group) -> None:
        try:
            x = group['x']
            y = group['y']
            ok = (
                x.shape == (NX,) and y.shape == (NY,)
                and np.isclose(float(x[0]), X0) and np.isclose(float(x[1]) - float(x[0]), DX)
                and np.isclose(float(y[0]), Y0) and np.isclose(float(y[1]) - float(y[0]), DY)
            )
        except Exception as exc:
            raise DatasetError(f'HRRR grid coordinates could not be read: {type(exc).__name__}') from exc
        if not ok:
            raise DatasetError('HRRR grid differs from the projection this service assumes; update providers/hrrr.py')
