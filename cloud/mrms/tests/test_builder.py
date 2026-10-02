import datetime as dt
import json
import os

import numpy as np
import pytest
from conftest import make_grib
from PIL import Image

from builder import KEY_PREFIX, MANIFEST_KEY, MrmsBuilder
from products import PRODUCTS, decode_bytes
from source import SourceError, frame_key
from store import LocalStore

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 10, 2, 0, 30, tzinfo=UTC)
REFL = PRODUCTS['reflectivity']
SMALL = {'reflectivity': REFL, 'hail': PRODUCTS['hail']}


def conus_field(value_x: int, background_x: int) -> np.ndarray:
    """A coarse CONUS-shaped grid (0.5°), all "no echo" but one storm cell of raw value `value_x`."""
    packed = np.full((70, 140), background_x, np.uint16)
    packed[30, 70] = value_x
    return packed


class FakeSource:
    def __init__(self, times_by_product, fail_list=(), fail_fetch=()):
        self.files = {}
        for pid, times in times_by_product.items():
            p = PRODUCTS[pid]
            for t in times:
                self.files[frame_key(p.prefix, p.source, t)] = (p, t)
        self.fail_list, self.fail_fetch = set(fail_list), set(fail_fetch)
        self.fetched = []

    def list_since(self, prefix, source, since, until):
        if any(prefix == PRODUCTS[p].prefix for p in self.fail_list):
            raise SourceError('HTTPError: 503')
        return sorted((t, k) for k, (p, t) in self.files.items() if p.prefix == prefix and since < t <= until)

    def fetch(self, key):
        self.fetched.append(key)
        p, t = self.files[key]
        if p.id in self.fail_fetch:
            return b'GRIB broken'
        # reflectivity: R=-9990, D=1 → X=10500 is 51 dBZ, X=9000 is −99 (no echo).
        # Others: R=-30, D=1 → X=330 is 30, X=20 is −1 (no echo).
        if p.id == 'reflectivity':
            return make_grib(conus_field(10500, 9000), when=t.replace(tzinfo=None), lat1=54.75, lon1=230.25, step=0.5)
        return make_grib(conus_field(330, 20), when=t.replace(tzinfo=None), lat1=54.75, lon1=230.25, step=0.5, R=-30.0)


def every_2_min(n, end=NOW):
    return [end - dt.timedelta(minutes=2 * i) for i in range(n)][::-1]


def builder(source, tmp_path, now=NOW, **kw):
    kw.setdefault('products', SMALL)
    return MrmsBuilder(source, LocalStore(str(tmp_path)), clock=lambda: now.timestamp(), lo_width=280, hi_width=560,
                       workers=2, **kw)


def manifest(tmp_path):
    return json.load(open(os.path.join(tmp_path, MANIFEST_KEY)))


def test_builds_newest_frames_and_publishes_manifest(tmp_path):
    src = FakeSource({'reflectivity': every_2_min(5), 'hail': every_2_min(5)})
    summary = builder(src, tmp_path, max_new_frames=8).run()  # the cap has its own test
    m = manifest(tmp_path)
    assert m['kind'] == 'mrms-manifest' and m['schemaVersion'] == 1
    assert 'not endorsed by NOAA' in m['attribution']
    refl = m['products']['reflectivity']
    assert [f['time'] for f in refl['frames']] == [t.strftime('%Y-%m-%dT%H:%M:%SZ') for t in every_2_min(5)]
    assert refl['status'] == 'ok' and refl['latest'] == '2026-10-02T00:30:00Z' and refl['error'] is None
    assert m['image']['levels'] == {'lo': [280, 183], 'hi': [560, 366]}
    assert summary['framesWritten'] == 5 * 2 * 2  # 5 frames × 2 products × lo/hi

    frame = f'{KEY_PREFIX}/reflectivity/{refl["encodingId"]}/hi/{refl["frames"][-1]["id"]}.png'
    b = np.asarray(Image.open(os.path.join(tmp_path, frame)))
    e = refl['encoding']
    values = decode_bytes(b, e['lo'], e['hi'], e['transform'])
    assert np.nanmax(values) == pytest.approx(51, abs=0.4)  # the storm cell survived downsampling
    assert np.isnan(values).sum() == 0  # −999 never occurs here, so everything is "covered"


def test_only_new_files_are_downloaded(tmp_path):
    times = every_2_min(3)
    src = FakeSource({'reflectivity': times, 'hail': times})
    builder(src, tmp_path).run()
    later = NOW + dt.timedelta(minutes=2)
    src2 = FakeSource({'reflectivity': times + [later], 'hail': times + [later]})
    builder(src2, tmp_path, now=later).run()
    assert len(src2.fetched) == 2 and all(k.endswith('003000.grib2.gz') is False for k in src2.fetched)
    assert len(manifest(tmp_path)['products']['hail']['frames']) == 4


def test_catch_up_is_capped_and_newest_first(tmp_path):
    src = FakeSource({'reflectivity': every_2_min(30), 'hail': []})
    summary = builder(src, tmp_path, max_new_frames=4).run()
    refl = manifest(tmp_path)['products']['reflectivity']
    assert [f['time'] for f in refl['frames']][-1] == '2026-10-02T00:30:00Z'
    assert len(refl['frames']) == 4 and summary['products']['reflectivity']['pending'] == 26
    assert manifest(tmp_path)['products']['hail']['status'] == 'unavailable'


def test_window_is_anchored_to_the_clock(tmp_path):
    src = FakeSource({'reflectivity': every_2_min(5), 'hail': every_2_min(5)})
    builder(src, tmp_path).run()
    # MRMS stops publishing: 20 min later the frames are old (stale), 70 min later gone.
    builder(src, tmp_path, now=NOW + dt.timedelta(minutes=20)).run()
    assert manifest(tmp_path)['products']['reflectivity']['status'] == 'stale'
    builder(src, tmp_path, now=NOW + dt.timedelta(minutes=70)).run()
    refl = manifest(tmp_path)['products']['reflectivity']
    assert refl['status'] == 'unavailable' and refl['frames'] == []


def test_products_fail_independently(tmp_path):
    times = every_2_min(3)
    builder(FakeSource({'reflectivity': times, 'hail': times}), tmp_path).run()
    later = NOW + dt.timedelta(minutes=2)
    src = FakeSource({'reflectivity': times + [later], 'hail': times + [later]}, fail_list=['hail'])
    builder(src, tmp_path, now=later).run()
    m = manifest(tmp_path)['products']
    assert m['hail']['error']['code'] == 'source_unavailable' and len(m['hail']['frames']) == 3
    assert m['reflectivity']['error'] is None and len(m['reflectivity']['frames']) == 4


def test_a_corrupt_file_is_skipped_and_reported(tmp_path):
    src = FakeSource({'reflectivity': every_2_min(2), 'hail': every_2_min(2)}, fail_fetch=['hail'])
    summary = builder(src, tmp_path).run()
    m = manifest(tmp_path)['products']
    assert m['hail']['error']['code'] == 'frame_failed' and m['hail']['frames'] == []
    assert len(m['reflectivity']['frames']) == 2 and summary['productErrors'] == 1


def test_encoding_change_moves_frames_to_new_keys(tmp_path):
    src = FakeSource({'reflectivity': every_2_min(2), 'hail': []})
    builder(src, tmp_path).run()
    first = manifest(tmp_path)['products']['reflectivity']['encodingId']
    src.fetched.clear()
    builder(src, tmp_path, products={'reflectivity': REFL, 'hail': PRODUCTS['hail']}, ).run()
    assert src.fetched == []  # same encoding: nothing rebuilt
    import dataclasses
    changed = dataclasses.replace(REFL, hi=80)
    builder(src, tmp_path, products={'reflectivity': changed, 'hail': PRODUCTS['hail']}).run()
    second = manifest(tmp_path)['products']['reflectivity']['encodingId']
    assert second != first and len(src.fetched) == 2


def test_no_coverage_is_transparent(tmp_path):
    class Uncovered(FakeSource):
        def fetch(self, key):
            p, t = self.files[key]
            return make_grib(np.zeros((70, 140), np.uint16), when=t.replace(tzinfo=None), lat1=54.75, lon1=230.25, step=0.5)

    builder(Uncovered({'reflectivity': [NOW], 'hail': []}), tmp_path).run()
    refl = manifest(tmp_path)['products']['reflectivity']
    b = np.asarray(Image.open(os.path.join(tmp_path, KEY_PREFIX, 'reflectivity', refl['encodingId'], 'lo', refl['frames'][0]['id'] + '.png')))
    assert (b == 0).all()  # −999 everywhere → byte 0 (no data)


def test_every_product_definition_is_consistent():
    for p in PRODUCTS.values():
        values = [v for v, _, _ in p.palette]
        assert values == sorted(values), p.id
        assert p.lo <= values[0] and values[-1] <= p.hi, p.id
        assert p.palette[0][2] == 0.0, f'{p.id}: the lowest value must be transparent (no echo)'
        assert p.prefix.startswith('CONUS/') and p.prefix.endswith('/')


def test_encoding_matches_the_browser():
    # Tests/Vitest/mrms.test.js asserts the same bytes from valueToByte().
    from products import encode_bytes
    assert encode_bytes(np.array([25.0]), 0, 150, 'sqrt')[0] == 105
    assert encode_bytes(np.array([51.0]), -10, 75)[0] == 183
