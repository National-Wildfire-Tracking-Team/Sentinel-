"""HRRR and GFS providers: dataset discovery, grid lookup, wind orientation, reads."""

import math

import numpy as np
import pytest
from conftest import (
    HONOLULU,
    HONOLULU_GFS_CELL,
    HOUR,
    LA,
    LA_GFS_CELL,
    LA_HRRR_CELL,
    T12Z,
    build_dataset,
    constant_cell,
)

from providers import DatasetError, GFSProvider, HRRRProvider, OutOfDomainError
from providers.hrrr import DX, DY, X0, Y0, project, unproject

# (lat, lon) -> (iy, ix, cell lat, cell lon), read from the real dataset's
# 2-D latitude/longitude arrays (noaa-hrrr-forecast-48-hour v0.1.0).
HRRR_REFERENCE = {
    (34.05, -118.25): (622, 265, 34.05436, -118.26541),  # Los Angeles
    (47.6, -122.3): (106, 279, 47.60279, -122.28569),  # Seattle
    (25.77, -80.19): (949, 1487, 25.77281, -80.19772),  # Miami
    (44.98, -93.27): (286, 1011, 44.96948, -93.26221),  # Minneapolis
    (28.54, -81.38): (853, 1429, 28.54992, -81.37944),  # Orlando
}


def bearing(u, v):
    return math.degrees(math.atan2(u, v))


class TestHRRRGrid:
    @pytest.mark.parametrize(('latlon', 'expected'), HRRR_REFERENCE.items())
    def test_locate_matches_dataset_lat_lon(self, latlon, expected):
        point = HRRRProvider().locate(*latlon)
        iy, ix, lat, lon = expected
        assert (point.iy, point.ix) == (iy, ix)
        assert point.lat == pytest.approx(lat, abs=2e-4)
        assert point.lon == pytest.approx(lon, abs=2e-4)

    def test_projection_round_trips(self):
        for lat, lon in HRRR_REFERENCE:
            back = unproject(*project(lat, lon))
            assert back == pytest.approx((lat, lon), abs=1e-9)

    @pytest.mark.parametrize('latlon', [(51.5, -0.12), HONOLULU, (21.0, -122.0), (61.2, -149.9), (-33.9, 151.2)])
    def test_outside_conus_is_out_of_domain(self, latlon):
        provider = HRRRProvider()
        with pytest.raises(OutOfDomainError):
            provider.locate(*latlon)
        assert not provider.contains(*latlon)

    def test_winds_are_rotated_from_grid_to_true_north(self):
        provider = HRRRProvider()
        for lat, lon in [(34.05, -118.25), (28.54, -81.38), (47.6, -122.3)]:
            point = provider.locate(lat, lon)
            # The true bearing of the grid's +y axis, measured from the grid
            # itself: unproject this cell and the next one along +y.
            la1, lo1 = unproject(X0 + point.ix * DX, Y0 + point.iy * DY)
            la2, lo2 = unproject(X0 + point.ix * DX, Y0 + (point.iy - 1) * DY)
            grid_north = math.degrees(math.atan2(math.radians(lo2 - lo1) * math.cos(math.radians(la1)),
                                                 math.radians(la2 - la1)))
            u, v = provider.earth_relative_wind(np.array(0.0), np.array(1.0), point)
            assert bearing(u, v) == pytest.approx(grid_north, abs=0.05)
            assert math.hypot(u, v) == pytest.approx(1.0)
        # West of the central meridian the grid is rotated counter-clockwise
        # from true north by ~13° at LA: unrotated winds would be that wrong.
        la = provider.locate(*LA)
        u, v = provider.earth_relative_wind(np.array(0.0), np.array(1.0), la)
        assert bearing(u, v) == pytest.approx(-12.93, abs=0.05)

    def test_coverage_outline_is_a_closed_ring(self):
        ring = HRRRProvider().domain_geojson()['coordinates'][0]
        assert ring[0] == ring[-1]
        lons = [p[0] for p in ring]
        lats = [p[1] for p in ring]
        assert min(lons) < -130 and max(lons) > -61
        assert min(lats) > 20 and max(lats) < 54


class TestGFSGrid:
    def test_locate_regular_grid(self):
        point = GFSProvider().locate(*LA)
        assert (point.iy, point.ix) == LA_GFS_CELL
        assert (point.lat, point.lon) == (34.0, -118.25)
        assert (GFSProvider().locate(*HONOLULU).iy, GFSProvider().locate(*HONOLULU).ix) == HONOLULU_GFS_CELL

    def test_longitude_wraps_at_the_antimeridian(self):
        point = GFSProvider().locate(10.0, 179.9)
        assert point.ix == 0 and point.lon == -180.0

    def test_poles_and_global_coverage(self):
        provider = GFSProvider()
        assert provider.locate(90, 0).iy == 0
        assert provider.locate(-90, 0).iy == 720
        assert provider.contains(51.5, -0.12) and provider.contains(*HONOLULU)
        assert provider.domain_geojson() is None

    def test_winds_are_already_earth_relative(self):
        point = GFSProvider().locate(*LA)
        u, v = GFSProvider().earth_relative_wind(np.array(1.0), np.array(2.0), point)
        assert (u, v) == (1.0, 2.0)

    def test_gfs_has_no_gust_source(self):
        # The dataset has no gust field; the provider must not claim one.
        assert 'windGust' not in GFSProvider.SOURCES
        assert 'dewPoint' not in GFSProvider.SOURCES
        assert 'windGust' in HRRRProvider.SOURCES


class TestDatasetDiscovery:
    def test_hrrr_run_index(self):
        runs = [T12Z - 12 * HOUR, T12Z - 6 * HOUR, T12Z]
        provider = HRRRProvider(build_dataset('hrrr', init_times=runs, lead_hours=[0, 1, 2, 3]))
        index = provider.run_index()
        assert list(index.init_times) == runs
        assert list(index.lead_seconds) == [0, 3600, 7200, 10800]
        assert index.expected_lead_count(2) == 4
        assert provider.snapshot_id

    def test_expected_length_shorter_than_axis(self):
        provider = GFSProvider(build_dataset('gfs', init_times=[T12Z], lead_hours=[0, 1, 2, 3, 6], expected_hours=3))
        assert provider.run_index().expected_lead_count(0) == 4

    def test_gfs_run_index_with_three_hourly_steps(self):
        provider = GFSProvider(build_dataset('gfs', init_times=[T12Z], lead_hours=[0, 1, 2, 3, 6, 9]))
        assert list(provider.run_index().lead_seconds / HOUR) == [0, 1, 2, 3, 6, 9]

    def test_read_point_returns_every_lead_for_requested_variables(self):
        storage = build_dataset('hrrr', init_times=[T12Z], lead_hours=[0, 1, 2],
                                cells={LA_HRRR_CELL: constant_cell({'temperature_2m': lambda run, i: 10.0 + i})})
        provider = HRRRProvider(storage)
        values = provider.read_point(0, provider.locate(*LA), ['temperature_2m', 'wind_gust_surface'])
        assert list(values['temperature_2m']) == [10.0, 11.0, 12.0]
        assert list(values['wind_gust_surface']) == [9.0, 9.0, 9.0]

    def test_unwritten_cells_read_as_missing(self):
        provider = GFSProvider(build_dataset('gfs', init_times=[T12Z], lead_hours=[0, 1]))
        values = provider.read_point(0, provider.locate(*LA), ['temperature_2m'])
        assert np.isnan(values['temperature_2m']).all()

    def test_a_regridded_dataset_is_rejected(self):
        storage = build_dataset('hrrr', init_times=[T12Z], lead_hours=[0], grid_override={'x0': X0 + 1500})
        with pytest.raises(DatasetError, match='grid differs'):
            HRRRProvider(storage).run_index()

    def test_missing_variable_is_a_dataset_error(self):
        provider = GFSProvider(build_dataset('gfs', init_times=[T12Z], lead_hours=[0]))
        with pytest.raises(DatasetError, match='no variable'):
            provider.read_point(0, provider.locate(*LA), ['wind_gust_surface'])

    def test_storage_failure_is_a_dataset_error(self):
        class Unreachable(HRRRProvider):
            def _make_storage(self):
                raise OSError('connection refused')

        with pytest.raises(DatasetError, match='could not be opened'):
            Unreachable().run_index()

    def test_read_failure_is_a_dataset_error(self, monkeypatch):
        storage = build_dataset('hrrr', init_times=[T12Z], lead_hours=[0], cells={LA_HRRR_CELL: constant_cell()})
        provider = HRRRProvider(storage)
        provider.run_index()

        class Broken:
            def __getitem__(self, _):
                raise OSError('S3 503 SlowDown')

        monkeypatch.setattr(provider, '_array', lambda name: Broken())
        with pytest.raises(DatasetError, match='could not be read'):
            provider.read_point(0, provider.locate(*LA), ['temperature_2m'])

    def test_production_storage_is_anonymous_us_west_2(self, monkeypatch):
        import icechunk

        captured = {}
        monkeypatch.setattr(icechunk, 's3_storage', lambda **kw: captured.update(kw) or 'storage')
        HRRRProvider()._make_storage()
        assert captured == {'bucket': 'dynamical-noaa-hrrr', 'prefix': 'noaa-hrrr-forecast-48-hour/v0.1.0.icechunk',
                            'region': 'us-west-2', 'anonymous': True}
        GFSProvider()._make_storage()
        assert captured['bucket'] == 'dynamical-noaa-gfs' and captured['anonymous'] is True
