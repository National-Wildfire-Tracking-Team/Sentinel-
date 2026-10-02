"""Map-field pipeline: PNG encoding, value encoding, grid geometry, and the builder end to end."""

import struct
import zlib

import numpy as np
import pytest
from conftest import HOUR, LA, LA_GFS_CELL, LA_HRRR_CELL, T12Z, build_dataset, constant_cell

from fields import grids
from fields.builder import KEY_PREFIX, MANIFEST_KEY, FieldBuilder
from fields.png import encode_png
from fields.store import LocalStore
from fields.variables import FIELD_VARIABLES, decode_bytes, encode_bytes
from providers import GFSProvider, HRRRProvider


def decode_png(body: bytes) -> np.ndarray:
    assert body[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, width, height, color = 8, b'', 0, 0, 0
    while pos < len(body):
        (n,) = struct.unpack('>I', body[pos:pos + 4])
        kind, data = body[pos + 4:pos + 8], body[pos + 8:pos + 8 + n]
        crc = struct.unpack('>I', body[pos + 8 + n:pos + 12 + n])[0]
        assert crc == zlib.crc32(kind + data) & 0xFFFFFFFF
        if kind == b'IHDR':
            width, height, _, color = struct.unpack('>IIBB', data[:10])
        elif kind == b'IDAT':
            idat += data
        pos += 12 + n
    ch = 1 if color == 0 else 4
    raw = np.frombuffer(zlib.decompress(idat), np.uint8).reshape(height, 1 + width * ch)
    assert (raw[:, 0] == 1).all()  # Sub filter on every row
    px = raw[:, 1:].reshape(height, width, ch).astype(np.int64)
    return (np.cumsum(px, axis=1) % 256).astype(np.uint8).squeeze()


class TestPng:
    def test_greyscale_round_trip(self):
        px = (np.arange(37 * 53) % 256).astype(np.uint8).reshape(37, 53)
        assert np.array_equal(decode_png(encode_png(px)), px)

    def test_rgba_round_trip(self):
        rng = np.random.default_rng(1)
        px = rng.integers(0, 256, (20, 31, 4), dtype=np.uint8)
        assert np.array_equal(decode_png(encode_png(px)), px)


class TestValueEncoding:
    @pytest.mark.parametrize('transform', ['linear', 'sqrt'])
    def test_round_trip_within_one_step(self, transform):
        lo, hi = 0.0, 50.0
        values = np.linspace(lo, hi, 1000)
        back = decode_bytes(encode_bytes(values, lo, hi, transform), lo, hi, transform)
        step = (hi - lo) / 254 if transform == 'linear' else None
        if step:
            assert np.nanmax(np.abs(back - values)) <= step / 2 + 1e-9
        assert np.nanmax(np.abs(back - values)) < 0.6

    def test_nodata_and_clipping(self):
        b = encode_bytes(np.array([np.nan, -100, 100, 25]), -40, 50)
        assert b[0] == 0  # no data → transparent
        assert b[1] == 1 and b[2] == 255  # clipped to the encoded range, never 0
        assert 1 < b[3] < 255


class TestGrids:
    def test_mercator_grid_rows_follow_latitude(self):
        g = grids.OutputGrid(-130, 20, -60, 55, 700)
        lat, lon = g.pixel_lonlat()
        assert lat.shape == (g.height, g.width)
        assert lat[0, 0] < 55 and lat[0, 0] > 54.5 and lat[-1, 0] > 20 and lat[-1, 0] < 20.5
        assert g.coordinates == [[-130, 55], [-60, 55], [-60, 20], [-130, 20]]

    def test_hrrr_pixel_takes_the_value_of_its_grid_cell(self):
        g = grids.hrrr_output_grid(1800)
        lut = grids.hrrr_lut(g)
        ny, nx = 1059, 1799
        src_x = np.tile(np.arange(nx, dtype='float32'), (ny, 1))  # value = source column
        src_y = np.tile(np.arange(ny, dtype='float32')[:, None], (1, nx))
        out_x, out_y = lut.resample(src_x), lut.resample(src_y)
        row = int(round((grids.merc_y(g.north) - grids.merc_y(LA[0])) / (grids.merc_y(g.north) - grids.merc_y(g.south)) * g.height - 0.5))
        col = int(round((LA[1] - g.west) / (g.east - g.west) * g.width - 0.5))
        assert out_y[row, col] == pytest.approx(LA_HRRR_CELL[0], abs=1.0)
        assert out_x[row, col] == pytest.approx(LA_HRRR_CELL[1], abs=1.0)
        assert np.isnan(out_x[0, 0])  # corners of the bounding box are outside the Lambert grid

    def test_gfs_subset_region(self):
        assert grids.GFS_ROWS == slice(60, 321) and grids.GFS_COLS == slice(0, 521)
        g = grids.gfs_output_grid(520)
        lut = grids.gfs_lut(g)
        src = np.tile(np.arange(261, dtype='float32')[:, None], (1, 521))
        out = lut.resample(src)
        row = int(round((grids.merc_y(75) - grids.merc_y(LA[0])) / (grids.merc_y(75) - grids.merc_y(10)) * g.height - 0.5))
        # LA is global row 224 → subset row 164
        assert out[row, 200] == pytest.approx(LA_GFS_CELL[0] - 60, abs=1.0)

    def test_hrrr_rotation_matches_provider(self):
        cos_a, sin_a = grids.hrrr_rotation(np.array([LA[1]]))
        point = HRRRProvider().locate(*LA)
        u, v = HRRRProvider().earth_relative_wind(np.array(0.0), np.array(1.0), point)
        assert float(sin_a[0]) == pytest.approx(float(u), abs=2e-3)
        assert float(cos_a[0]) == pytest.approx(float(v), abs=2e-3)


# ── builder, end to end on synthetic datasets ──

class RecordingStore(LocalStore):
    def __init__(self, root):
        super().__init__(root)
        self.order = []

    def put(self, key, body, content_type, cache_control):
        self.order.append((key, cache_control))
        super().put(key, body, content_type, cache_control)


RUNS = [T12Z - 6 * HOUR, T12Z]
HRRR_LEADS = [0, 1, 2, 3, 4, 5, 6]
GFS_LEADS = [0, 1, 2, 3, 6, 9, 12]


def centre_cell(model):
    b = FieldBuilder({}, None, hrrr_width=180, gfs_width=130)
    g = b.grid[f'{model}-lo']
    lat = float(grids.inv_merc_y((grids.merc_y(g.south) + grids.merc_y(g.north)) / 2))
    p = (HRRRProvider if model == 'hrrr' else GFSProvider)().locate(lat, (g.west + g.east) / 2)
    return (p.iy, p.ix)


def make_builder(tmp_path, hrrr_cell=None, gfs_cell=None):
    cell = hrrr_cell or constant_cell()
    # Blocks, not single cells: bilinear resampling needs neighbours, and a
    # 180 px test grid has ~40 km pixels.
    hrrr = build_dataset('hrrr', init_times=RUNS, lead_hours=HRRR_LEADS,
                         blocks={(*LA_HRRR_CELL, 30): cell, (*centre_cell('hrrr'), 2): cell})
    gcell = gfs_cell or constant_cell({'temperature_2m': 18.0})
    gfs = build_dataset('gfs', init_times=RUNS, lead_hours=GFS_LEADS,
                        blocks={(*LA_GFS_CELL, 8): gcell, (*centre_cell('gfs'), 1): gcell})
    store = RecordingStore(str(tmp_path))
    providers = {'hrrr': HRRRProvider(hrrr, chunk_cache_bytes=0), 'gfs': GFSProvider(gfs, chunk_cache_bytes=0)}
    return FieldBuilder(providers, store, hrrr_width=180, gfs_width=130, clock=lambda: T12Z + 3 * HOUR), store


def read_manifest(store):
    return store.get_json(MANIFEST_KEY)


class TestBuilder:
    def test_builds_every_variable_hour_and_resolution(self, tmp_path):
        builder, store = make_builder(tmp_path)
        summary = builder.run()
        assert summary['built'] is True
        m = read_manifest(store)
        hrrr = m['models']['hrrr']['current']
        assert hrrr['id'] == '20261001T12Z' and hrrr['complete'] is True and hrrr['hours'] == HRRR_LEADS
        keys = {k for k, _ in store.order}
        for var in FIELD_VARIABLES.values():
            for hour in HRRR_LEADS:
                for res in ('lo', 'hi'):
                    assert f'{KEY_PREFIX}/hrrr/20261001T12Z/{var.id}/{res}/{hour:03d}.png' in keys
            gfs_key = f'{KEY_PREFIX}/gfs/20261001T12Z/{var.id}/lo/012.png'
            assert (gfs_key in keys) == ('gfs' in var.models)
        assert f'{KEY_PREFIX}/hrrr/20261001T12Z/wind/006.png' in keys
        assert 'windGust' not in m['models']['gfs']['variables']

    def test_manifest_is_written_last_and_frames_are_immutable(self, tmp_path):
        builder, store = make_builder(tmp_path)
        builder.run()
        assert store.order[-1][0] == MANIFEST_KEY
        assert 'max-age=60' in store.order[-1][1]
        assert 'stale-while-revalidate' in store.order[-1][1]
        assert all('immutable' in cc for k, cc in store.order[:-1])

    def test_differences_only_for_compatible_variables_and_windows(self, tmp_path):
        builder, store = make_builder(tmp_path)
        builder.run()
        m = read_manifest(store)
        diff = m['difference']
        assert diff['subtract'] == 'HRRR − GFS'
        assert diff['hrrrRunTime'] == diff['gfsRunTime'] == '2026-10-01T12:00:00Z'
        assert set(diff['variables']) == {'temperature', 'relativeHumidity', 'windSpeed', 'precipitationRate', 'pressureMsl'}
        # shared valid times: HRRR 0-6 h hourly ∩ GFS 0,1,2,3,6
        assert [t[11:13] for t in diff['validTimes']] == ['12', '13', '14', '15', '18']
        keys = {k for k, _ in store.order}
        d = f'{KEY_PREFIX}/diff/20261001T12Z_20261001T12Z'
        assert f'{d}/temperature/20261001T1800Z.png' in keys
        # +6 h: HRRR's precipitation covers 1 h, GFS's 3 h — not comparable, so not written
        assert f'{d}/precipitationRate/20261001T1800Z.png' not in keys
        assert f'{d}/precipitationRate/20261001T1500Z.png' in keys
        assert not any('/windGust/' in k or '/precipitationTotal/' in k or '/pressureSurface/' in k
                       for k in keys if '/diff/' in k)

    def test_difference_values(self, tmp_path):
        builder, store = make_builder(tmp_path)  # HRRR 20 °C, GFS 18 °C at LA
        builder.run()
        g = builder.grid['hrrr-lo']
        body = open(tmp_path / f'{KEY_PREFIX}/diff/20261001T12Z_20261001T12Z/temperature/20261001T1300Z.png', 'rb').read()
        px = decode_png(body)
        vals = decode_bytes(px, -10, 10)
        assert np.nanmax(vals) == pytest.approx(2.0, abs=0.1)  # HRRR − GFS, not the other way round
        assert px.shape == (g.height, g.width)

    def test_precipitation_total_accumulates_since_run_start(self, tmp_path):
        builder, store = make_builder(tmp_path)  # 1 mm/h everywhere it's set
        builder.run()
        totals = []
        for hour in (0, 1, 2, 6):
            px = decode_png(open(tmp_path / f'{KEY_PREFIX}/hrrr/20261001T12Z/precipitationTotal/hi/{hour:03d}.png', 'rb').read())
            totals.append(np.nanmax(decode_bytes(px, 0, 150, 'sqrt')))
        assert totals[0] == pytest.approx(0, abs=0.01)
        assert totals[1] == pytest.approx(1, abs=0.4)
        assert totals[3] == pytest.approx(6, abs=0.6)

    def test_reflectivity_field_is_hrrr_only_and_labelled_simulated(self, tmp_path):
        builder, store = make_builder(tmp_path)  # 35 dBZ in the test blocks
        builder.run()
        m = read_manifest(store)
        spec = m['variables']['compositeReflectivity']
        assert spec['models'] == ['hrrr'] and 'difference' not in spec
        assert 'not radar observations' in spec['notice']
        assert 'compositeReflectivity' in m['models']['hrrr']['variables']
        assert 'compositeReflectivity' not in m['models']['gfs']['variables']
        px = decode_png(open(tmp_path / f'{KEY_PREFIX}/hrrr/20261001T12Z/compositeReflectivity/hi/003.png', 'rb').read())
        assert np.nanmax(decode_bytes(px, -10, 75)) == pytest.approx(35, abs=0.4)

    def test_second_run_does_nothing(self, tmp_path):
        builder, store = make_builder(tmp_path)
        builder.run()
        n = len(store.order)
        again = FieldBuilder(builder.providers, store, hrrr_width=180, gfs_width=130).run()
        assert again['built'] is False
        assert len(store.order) == n

    def test_a_new_variable_rebuilds_the_current_run_once(self, tmp_path):
        builder, store = make_builder(tmp_path)
        builder.run()
        manifest = read_manifest(store)
        manifest['models']['hrrr']['variables'].remove('compositeReflectivity')  # as published by older code
        store.put(MANIFEST_KEY, __import__('json').dumps(manifest).encode(), 'application/json', 'x')
        again = FieldBuilder(builder.providers, store, hrrr_width=180, gfs_width=130).run()
        assert again['built'] is True
        assert 'compositeReflectivity' in read_manifest(store)['models']['hrrr']['variables']
        assert FieldBuilder(builder.providers, store, hrrr_width=180, gfs_width=130).run()['built'] is False

    def test_incomplete_newest_run_keeps_the_previous_complete_run(self, tmp_path):
        builder, store = make_builder(tmp_path, hrrr_cell=constant_cell(missing_after={1: 3}))
        builder.run()
        hrrr = read_manifest(store)['models']['hrrr']['current']
        assert hrrr['id'] == '20261001T06Z' and hrrr['complete'] is True

    def test_wind_vectors_are_earth_relative(self, tmp_path):
        # Grid-relative wind straight up the HRRR grid (v_grid = 5) at LA is
        # NNW in true terms: earth u must be negative.
        builder, store = make_builder(tmp_path, hrrr_cell=constant_cell({'wind_u_10m': 0.0, 'wind_v_10m': 5.0}))
        builder.run()
        px = decode_png(open(tmp_path / f'{KEY_PREFIX}/hrrr/20261001T12Z/wind/001.png', 'rb').read())
        has = px[..., 3] == 255
        u = decode_bytes(px[..., 0][has], -50, 50)
        v = decode_bytes(px[..., 1][has], -50, 50)
        la = (u < -0.5) & (v > 4)
        assert la.any(), 'expected rotated (negative u) vectors at the LA cell'
