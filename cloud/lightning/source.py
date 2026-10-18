"""
source.py
Reads GOES GLM Level 2 flashes from NOAA's public AWS Open Data buckets
(s3://noaa-goes19 for GOES-East, s3://noaa-goes18 for GOES-West, us-east-1)
with plain unsigned HTTPS: no AWS credentials, no SDK. The builder runs in
us-east-1, so the reads stay in-region.

Keys look like
  GLM-L2-LCFA/<YYYY>/<DDD>/<HH>/OR_GLM-L2-LCFA_G19_s<YYYYDDDHHMMSSs>_e<…>_c<…>.nc
(DDD = day of year, one file per 20 s), so a lexical listing of an hour is a
chronological one, and `start-after` lists only files newer than one we've read.
"""

from __future__ import annotations

import datetime as dt
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

REGION = 'us-east-1'
PRODUCT = 'GLM-L2-LCFA'
USER_AGENT = 'SentinelLightning/1.0 (+https://app.nationalwildfiretrackingteam.org)'
TIMEOUT_SECONDS = 20
MAX_OBJECT_BYTES = 16 * 1024 * 1024  # a busy 20-second file is a few MB at most

# The satellites read, and where each looks from (nominal sub-satellite longitude).
SATELLITES = {
    'goes19': {'label': 'GOES-East (GOES-19)', 'bucket': 'noaa-goes19', 'subLon': -75.2},
    'goes18': {'label': 'GOES-West (GOES-18)', 'bucket': 'noaa-goes18', 'subLon': -137.2},
}

_S3_NS = '{http://s3.amazonaws.com/doc/2006-03-01/}'
_KEY_START = re.compile(r'_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d_')


class SourceError(RuntimeError):
    pass


def key_time(key: str) -> dt.datetime | None:
    """Start of the 20 seconds a file covers."""
    m = _KEY_START.search(key)
    if not m:
        return None
    year, doy, hh, mm, ss = (int(x) for x in m.groups())
    return dt.datetime(year, 1, 1, hh, mm, ss, tzinfo=dt.timezone.utc) + dt.timedelta(days=doy - 1)


def hour_prefix(when: dt.datetime) -> str:
    return f'{PRODUCT}/{when:%Y}/{when.timetuple().tm_yday:03d}/{when:%H}/'


class GlmSource:
    def __init__(self, opener=None, base_url_for=None):
        self._open = opener or urllib.request.urlopen
        self._base = base_url_for or (lambda sat: f"https://{SATELLITES[sat]['bucket']}.s3.{REGION}.amazonaws.com")

    def _get(self, url: str) -> bytes:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        try:
            with self._open(req, timeout=TIMEOUT_SECONDS) as res:
                body = res.read(MAX_OBJECT_BYTES + 1)
        except Exception as exc:  # URLError, HTTPError, timeouts
            raise SourceError(f'{type(exc).__name__}: {exc}') from exc
        if len(body) > MAX_OBJECT_BYTES:
            raise SourceError('object larger than expected')
        return body

    def _list(self, sat: str, prefix: str, start_after: str | None) -> list[str]:
        keys, token = [], None
        while True:
            params = {'list-type': '2', 'prefix': prefix}
            if start_after and start_after.startswith(prefix):
                params['start-after'] = start_after
            if token:
                params['continuation-token'] = token
            root = ET.fromstring(self._get(f'{self._base(sat)}/?{urllib.parse.urlencode(params)}'))
            keys += [el.text for el in root.iter(f'{_S3_NS}Key')]
            token = root.findtext(f'{_S3_NS}NextContinuationToken')
            if root.findtext(f'{_S3_NS}IsTruncated') != 'true' or not token:
                return keys

    def list_since(self, sat: str, since: dt.datetime, until: dt.datetime, after_key: str | None = None) -> list[tuple[dt.datetime, str]]:
        """(start time, key) of every file with since <= start <= until (and after `after_key`), oldest first.

        The bucket is partitioned by UTC hour, so the window's hours are listed one by one.
        """
        out = []
        hour = since.replace(minute=0, second=0, microsecond=0)
        while hour <= until:
            for key in self._list(sat, hour_prefix(hour), after_key):
                t = key_time(key)
                if t and since <= t <= until and (not after_key or key > after_key):
                    out.append((t, key))
            hour += dt.timedelta(hours=1)
        return sorted(out)

    def fetch(self, sat: str, key: str) -> bytes:
        return self._get(f'{self._base(sat)}/{urllib.parse.quote(key)}')
