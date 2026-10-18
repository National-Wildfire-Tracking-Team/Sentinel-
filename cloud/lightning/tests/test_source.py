import datetime as dt
import io

import pytest

from source import GlmSource, SourceError, hour_prefix, key_time

UTC = dt.timezone.utc


def key(sat_id, t):
    return (f'GLM-L2-LCFA/{t:%Y}/{t.timetuple().tm_yday:03d}/{t:%H}/'
            f'OR_GLM-L2-LCFA_{sat_id}_s{t:%Y}{t.timetuple().tm_yday:03d}{t:%H%M%S}0_e0_c0.nc')


def test_key_time_and_hour_prefix():
    t = dt.datetime(2026, 10, 18, 18, 49, 20, tzinfo=UTC)
    assert key_time(key('G19', t)) == t
    assert key_time('nope.nc') is None
    assert hour_prefix(t) == 'GLM-L2-LCFA/2026/291/18/'


class FakeOpener:
    def __init__(self, keys_by_prefix):
        self.keys_by_prefix = keys_by_prefix
        self.urls = []

    def __call__(self, req, timeout):
        url = req.full_url
        self.urls.append(url)
        prefix = next((p for p in self.keys_by_prefix if p.replace('/', '%2F') in url), None)
        keys = self.keys_by_prefix.get(prefix, [])
        body = ('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
                + ''.join(f'<Contents><Key>{k}</Key></Contents>' for k in keys)
                + '<IsTruncated>false</IsTruncated></ListBucketResult>')
        return io.BytesIO(body.encode())


def test_lists_each_hour_of_the_window_in_order():
    t0 = dt.datetime(2026, 10, 18, 18, 55, 0, tzinfo=UTC)
    t1 = dt.datetime(2026, 10, 18, 19, 0, 20, tzinfo=UTC)
    early = dt.datetime(2026, 10, 18, 18, 40, 0, tzinfo=UTC)
    opener = FakeOpener({
        hour_prefix(t0): [key('G19', early), key('G19', t0)],
        hour_prefix(t1): [key('G19', t1)],
    })
    listed = GlmSource(opener=opener).list_since('goes19', dt.datetime(2026, 10, 18, 18, 50, tzinfo=UTC), t1)
    assert [t for t, _ in listed] == [t0, t1]
    assert all('noaa-goes19.s3.us-east-1.amazonaws.com' in u for u in opener.urls)
    assert len(opener.urls) == 2


def test_failures_are_source_errors():
    def opener(req, timeout):
        raise OSError('boom')

    with pytest.raises(SourceError):
        GlmSource(opener=opener).fetch('goes18', 'x.nc')
