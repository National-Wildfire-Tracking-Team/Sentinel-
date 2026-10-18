import datetime as dt
import gzip
import json

import numpy as np
import pytest

from builder import LATEST_KEY, LightningBuilder, decode_flashes, in_area, nearest_to
from source import SourceError
from store import LocalStore

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 10, 18, 19, 0, 0, tzinfo=UTC)


def key(sat, t):
    sid = {'goes19': 'G19', 'goes18': 'G18'}[sat]
    return f'GLM-L2-LCFA/{t:%Y}/{t.timetuple().tm_yday:03d}/{t:%H}/OR_GLM-L2-LCFA_{sid}_s{t:%Y}{t.timetuple().tm_yday:03d}{t:%H%M%S}0_e0_c0.nc'


class FakeSource:
    """files: {sat: [(start datetime, [(lat, lon, sec, energy, quality)])]}"""

    def __init__(self, glm, files, fail_list=(), fail_fetch=()):
        self.glm = glm
        self.files = {sat: {key(sat, t): (t, fl) for t, fl in entries} for sat, entries in files.items()}
        self.fail_list = set(fail_list)
        self.fail_fetch = set(fail_fetch)
        self.fetched = []

    def list_since(self, sat, since, until, after_key=None):
        if sat in self.fail_list:
            raise SourceError('listing failed')
        return sorted((t, k) for k, (t, _) in self.files.get(sat, {}).items() if since <= t <= until)

    def fetch(self, sat, k):
        self.fetched.append(k)
        if k in self.fail_fetch:
            raise SourceError('download failed')
        t, flashes = self.files[sat][k]
        return self.glm(flashes, start=t, platform={'goes19': 'G19', 'goes18': 'G18'}[sat])


def read_latest(tmp_path):
    with open(tmp_path / LATEST_KEY, 'rb') as fh:
        body = fh.read()
    assert body[:2] == b'\x1f\x8b'  # stored gzipped
    return json.loads(gzip.decompress(body))


def builder(source, tmp_path, now=NOW, **kw):
    return LightningBuilder(source, LocalStore(str(tmp_path)), clock=lambda: now.timestamp(), **kw)


def test_area_and_satellite_ownership():
    lat = np.array([35.0, 35.0, 5.0, 52.0])
    lon = np.array([-97.0, -120.0, -97.0, 175.0])
    assert in_area(lat, lon).tolist() == [True, True, False, True]
    # -97 is nearer GOES-East (-75.2); -120 nearer GOES-West (-137.2); 175°E is West's (across the antimeridian)
    assert nearest_to('goes19', lon).tolist() == [True, False, True, False]
    assert nearest_to('goes18', lon).tolist() == [False, True, False, True]


def test_builds_the_window_once_per_flash(glm, tmp_path):
    t = NOW - dt.timedelta(minutes=2)
    src = FakeSource(glm, {
        'goes19': [(t, [(35.0, -97.0, 3.0, 2e-14, 0), (35.0, -120.0, 4.0, 2e-14, 0), (2.0, -60.0, 5.0, 2e-14, 0)])],
        'goes18': [(t, [(35.0, -120.0, 4.1, 2e-14, 0), (35.0, -97.0, 3.1, 2e-14, 0)])],
    })
    summary = builder(src, tmp_path).run()
    doc = read_latest(tmp_path)
    assert doc['schemaVersion'] == 1 and doc['count'] == 2 == summary['flashes']
    f = doc['flashes']
    assert f['lon'] == [-9700, -12000] and f['lat'] == [3500, 3500]
    assert [doc['base'] + s for s in f['t']] == [round(t.timestamp() + 3), round(t.timestamp() + 4.1)]
    assert f['e'] == [20, 20]  # femtojoules
    assert doc['sources']['goes19']['latest'] == '2026-10-18T18:58:20Z'
    assert summary['filesRead'] == 2 and summary['sourceErrors'] == 0


def test_reads_each_file_once_and_ages_flashes_out(glm, tmp_path):
    old = NOW - dt.timedelta(minutes=12)
    src = FakeSource(glm, {'goes19': [(old, [(35.0, -97.0, 1.0, 1e-14, 0)])], 'goes18': []})
    builder(src, tmp_path).run()
    assert read_latest(tmp_path)['count'] == 1

    newer = NOW + dt.timedelta(minutes=1)
    src.files['goes19'][key('goes19', newer)] = (newer, [(36.0, -96.0, 2.0, 1e-14, 0)])
    builder(src, tmp_path, now=NOW + dt.timedelta(minutes=1, seconds=30)).run()
    assert src.fetched.count(key('goes19', old)) == 1
    doc = read_latest(tmp_path)
    assert doc['count'] == 2

    builder(src, tmp_path, now=NOW + dt.timedelta(minutes=3, seconds=30)).run()
    doc = read_latest(tmp_path)
    assert doc['flashes']['lat'] == [3600]  # the first flash is now over 15 minutes old
    assert len(src.fetched) == 2


def test_cold_start_reads_the_newest_files_first(glm, tmp_path):
    times = [NOW - dt.timedelta(seconds=20 * i) for i in range(1, 6)]
    src = FakeSource(glm, {'goes19': [(t, [(35.0, -97.0, 1.0, 1e-14, 0)]) for t in times], 'goes18': []})
    builder(src, tmp_path, max_files_per_satellite=2).run()
    assert sorted(src.fetched) == sorted(key('goes19', t) for t in times[:2])
    builder(src, tmp_path, max_files_per_satellite=2).run()
    assert len(set(src.fetched)) == 4 and len(src.fetched) == 4


def test_satellites_fail_on_their_own_and_retry(glm, tmp_path):
    t = NOW - dt.timedelta(minutes=1)
    src = FakeSource(glm, {
        'goes19': [(t, [(35.0, -97.0, 1.0, 1e-14, 0)])],
        'goes18': [(t, [(35.0, -120.0, 1.0, 1e-14, 0)])],
    }, fail_list={'goes18'}, fail_fetch={key('goes19', t)})
    summary = builder(src, tmp_path).run()
    doc = read_latest(tmp_path)
    assert summary['sourceErrors'] == 2 and doc['count'] == 0
    assert 'error' in doc['sources']['goes18']

    src.fail_list.clear()
    src.fail_fetch.clear()
    builder(src, tmp_path).run()
    assert read_latest(tmp_path)['count'] == 2


def test_decode_round_trip_and_bad_state(glm, tmp_path):
    t = NOW - dt.timedelta(minutes=1)
    builder(FakeSource(glm, {'goes19': [(t, [(35.25, -97.75, 1.0, 3e-14, 0)])], 'goes18': []}), tmp_path).run()
    back = decode_flashes(read_latest(tmp_path))
    assert back['lat'].tolist() == [35.25] and back['lon'].tolist() == [-97.75]
    assert back['energy'][0] == pytest.approx(3e-14, rel=0.05)
    assert len(decode_flashes({'schemaVersion': 99})['t']) == 0
    assert len(decode_flashes(None)['t']) == 0
