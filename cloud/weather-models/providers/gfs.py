"""
providers/gfs.py
NOAA GFS (Global Forecast System), 0.25°, global, from
s3://dynamical-noaa-gfs/noaa-gfs-forecast (dynamical.org).

Runs at 00, 06, 12 and 18 UTC, lead times 0-384 h: hourly to 120 h, then
every 3 h. The grid is a regular latitude/longitude grid (latitude 90 → -90,
longitude -180 → 179.75), so indexing is arithmetic and the u/v winds are
already eastward/northward.

GFS in this dataset has no wind-gust variable, so this provider has no
windGust source and the API reports gusts as unavailable for GFS rather than
estimating them.
"""

from __future__ import annotations

import numpy as np

from .base import DatasetError, GridPoint, OutOfDomainError, WeatherModelProvider

LAT_START, LON_START, STEP = 90.0, -180.0, 0.25
NLAT, NLON = 721, 1440


class GFSProvider(WeatherModelProvider):
    id = 'gfs'
    name = 'GFS'
    full_name = 'Global Forecast System'
    resolution = '0.25° (~25 km)'
    domain = 'Global'

    bucket = 'dynamical-noaa-gfs'
    prefix = 'noaa-gfs-forecast/v0.2.7.icechunk'
    dataset_id = 'noaa-gfs-forecast'
    dataset_version = '0.2.7'
    attribution = 'NOAA NWS NCEP GFS data processed by dynamical.org from NOAA Open Data Dissemination archives.'

    max_forecast_hours = 384
    default_forecast_hours = 168
    # Runs appear ~5 h after init (all 384 h take longer), every 6 h, so a
    # healthy newest run is at most ~11 h old.
    stale_after_hours = 18
    max_age_hours = 36

    SOURCES = {
        'temperature': ('temperature_2m',),
        'relativeHumidity': ('relative_humidity_2m',),
        'windSpeed': ('wind_u_10m', 'wind_v_10m'),
        'windDirection': ('wind_u_10m', 'wind_v_10m'),
        'precipitationRate': ('precipitation_surface',),
        'precipitationAmount': ('precipitation_surface',),
        'pressureSurface': ('pressure_surface',),
        'pressureMsl': ('pressure_reduced_to_mean_sea_level',),
        'cloudCover': ('total_cloud_cover_atmosphere',),
    }

    def locate(self, lat: float, lon: float) -> GridPoint:
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise OutOfDomainError(f'({lat}, {lon}) is not a valid coordinate')
        iy = round((LAT_START - lat) / STEP)
        ix = round((lon - LON_START) / STEP) % NLON  # 179.9° wraps to -180°
        return GridPoint(iy=iy, ix=ix, lat=LAT_START - iy * STEP, lon=LON_START + ix * STEP)

    def validate_grid(self, group) -> None:
        try:
            lat = group['latitude']
            lon = group['longitude']
            ok = (
                lat.shape == (NLAT,) and lon.shape == (NLON,)
                and np.isclose(float(lat[0]), LAT_START) and np.isclose(float(lat[1]) - float(lat[0]), -STEP)
                and np.isclose(float(lon[0]), LON_START) and np.isclose(float(lon[1]) - float(lon[0]), STEP)
            )
        except Exception as exc:
            raise DatasetError(f'GFS grid coordinates could not be read: {type(exc).__name__}') from exc
        if not ok:
            raise DatasetError('GFS grid differs from the 0.25° grid this service assumes; update providers/gfs.py')
