import datetime as dt

import numpy as np
import pytest
from conftest import FakeSource, storm_values
from test_render import read_png

from fields import FIELDS, decode_bytes
from service import HafsService, RequestError

CYCLE = '2026100806'
NOW = dt.datetime(2026, 10, 8, 10, 0, tzinfo=dt.timezone.utc).timestamp()
FULL = list(range(0, 127, 3))


def service(runs=None, **kw):
    runs = runs if runs is not None else {('hfsa', CYCLE): {'09l': [0, 3, 6]}}
    source = FakeSource(runs, names={'09l': 'isaias'}, **{k: v for k, v in kw.items() if k in ('modified', 'fail')})
    return HafsService(source, clock=lambda: kw.get('now', NOW), workers=4, catalog_days=1), source


def test_catalog_lists_runs_storms_and_every_model():
    svc, _ = service({('hfsa', CYCLE): {'09l': FULL, '18e': [0, 3]}, ('hfsb', '2026100800'): {'09l': [0]}})
    body = svc.catalog()
    models = {m['id']: m for m in body['models']}
    assert list(models) == ['hfsa', 'hfsb', 'hwrf', 'hmon']
    assert models['hwrf']['runs'] == [] and models['hwrf']['status'] == 'legacy'
    (run,) = models['hfsa']['runs']
    assert run['cycle'] == CYCLE and run['initTime'] == '2026-10-08T06:00:00Z'
    storms = {s['id']: s for s in run['storms']}
    assert storms['09l']['atcfId'] == 'AL092026' and storms['09l']['name'] == 'ISAIAS'
    assert storms['09l']['status'] == 'complete'
    assert storms['18e']['atcfId'] == 'EP182026' and storms['18e']['name'] is None
    # Last modified 09:00, now 10:00: still arriving.
    assert storms['18e']['status'] == 'in-progress'
    assert storms['18e']['domains']['storm']['hours'] == [0, 3]
    assert {f['id'] for f in body['fields']} == set(FIELDS)
    assert body['errors'] == []


def test_catalog_is_cached_and_reports_listing_errors():
    svc, src = service()
    svc.catalog()
    n = len(src.reads)
    svc.catalog()
    assert len(src.reads) == n
    svc2, _ = service(fail=('list',))
    body = svc2.catalog()
    assert body['models'][0]['runs'] == [] and body['errors'][0]['model'] == 'hfsa'


def test_old_incomplete_run_is_marked_incomplete():
    svc, _ = service(now=NOW + 6 * 3600)
    (storm,) = svc.catalog()['models'][0]['runs'][0]['storms']
    assert storm['status'] == 'incomplete'


def test_run_detail_has_frames_and_per_hour_field_availability():
    svc, _ = service()
    body = svc.run_detail('hfsa', CYCLE, '09l')
    assert body['storm']['atcfId'] == 'AL092026' and body['storm']['name'] == 'ISAIAS'
    nest = body['domains']['storm']
    assert nest['hours'] == [0, 3, 6] and nest['latestHour'] == 6
    assert nest['frames']['3']['validTime'] == '2026-10-08T09:00:00Z'
    assert len(nest['frames']['3']['coordinates']) == 4
    assert nest['fields']['mslp'] == [0, 3, 6]
    assert nest['fields']['precipTotal'] == [3, 6]  # nothing accumulated at +0 h
    assert 'gust' not in nest['fields']  # not in this file's inventory at all
    assert nest['problems'] == []


def test_run_settles_six_hours_after_its_last_file():
    svc, _ = service()
    svc.run_detail('hfsa', CYCLE, '09l')
    assert not svc.run_is_settled('hfsa', CYCLE, '09l')
    svc2, _ = service(modified='2026-10-08T03:00:00.000Z')
    svc2.run_detail('hfsa', CYCLE, '09l')
    assert svc2.run_is_settled('hfsa', CYCLE, '09l')


@pytest.mark.parametrize('field_id', ['mslp', 'windSpeed10m', 'precipTotal'])
def test_frame_values_match_the_source_field(field_id):
    svc, _ = service()
    png, meta = svc.frame('hfsa', CYCLE, '09l', 'storm', field_id, 3)
    fd = FIELDS[field_id]
    b = read_png(png)
    assert [meta['size'][1], meta['size'][0]] == list(b.shape)
    assert meta['validTime'] == '2026-10-08T09:00:00Z'
    v = decode_bytes(b, fd.lo, fd.hi, fd.transform)
    src = storm_values(3)
    if field_id == 'mslp':
        truth = src['PRMSL'] / 100
    elif field_id == 'windSpeed10m':
        truth = np.hypot(src['UGRD'], src['VGRD'])
    else:
        truth = src['APCP']
    assert np.nanmin(v) == pytest.approx(np.nanmin(truth), abs=(fd.hi - fd.lo) / 254 * 2 + 0.5)
    assert np.nanmax(v) == pytest.approx(np.nanmax(truth), abs=(fd.hi - fd.lo) / 254 * 2 + 0.5)
    assert (b == 0).any()  # the masked corner stays transparent


def test_frame_reads_only_the_messages_it_needs():
    svc, src = service()
    svc.frame('hfsa', CYCLE, '09l', 'storm', 'windSpeed10m', 3)
    ranges = [r for r in src.reads if r[0] == 'range']
    assert len(ranges) == 2  # UGRD and VGRD, nothing else


def test_last_message_in_a_file_is_bounded_by_the_listed_size():
    # APCP is the file's last message: without the size its end is unknown,
    # and an over-long range is a short read from S3.
    svc, src = service()
    svc.frame('hfsa', CYCLE, '09l', 'storm', 'precipTotal', 6)
    (r,) = [r for r in src.reads if r[0] == 'range']
    assert r[-1] == len(src.files[(CYCLE, 6)].data) - 1


@pytest.mark.parametrize('args, status, code', [
    (('nope', CYCLE, '09l', 'storm', 'mslp', 3), 404, 'unknown_model'),
    (('hwrf', CYCLE, '09l', 'storm', 'mslp', 3), 404, 'model_retired'),
    (('hfsa', '2026100807', '09l', 'storm', 'mslp', 3), 400, 'bad_request'),
    (('hfsa', '2026139906', '09l', 'storm', 'mslp', 3), 400, 'bad_request'),
    (('hfsa', CYCLE, '9l', 'storm', 'mslp', 3), 400, 'bad_request'),
    (('hfsa', CYCLE, '09l', 'outer', 'mslp', 3), 404, 'unknown_domain'),
    (('hfsa', CYCLE, '09l', 'storm', 'nope', 3), 404, 'unknown_field'),
    (('hfsa', CYCLE, '09l', 'storm', 'mslp', 9), 404, 'hour_unavailable'),
    (('hfsa', CYCLE, '09l', 'storm', 'precipTotal', 0), 404, 'field_unavailable'),
    (('hfsa', CYCLE, '09l', 'storm', 'gust', 3), 404, 'field_unavailable'),
])
def test_frame_errors(args, status, code):
    svc, _ = service()
    with pytest.raises(RequestError) as err:
        svc.frame(*args)
    assert (err.value.status, err.value.code) == (status, code)


def test_missing_run_is_404():
    svc, _ = service()
    with pytest.raises(RequestError) as err:
        svc.run_detail('hfsa', CYCLE, '18e')
    assert (err.value.status, err.value.code) == (404, 'run_not_found')
