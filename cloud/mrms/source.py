"""
source.py
Reads NOAA MRMS from the public AWS Open Data bucket s3://noaa-mrms-pds
(us-east-1) with plain unsigned HTTPS: no AWS credentials, no SDK. The
builder runs in us-east-1, so the reads stay in-region.

Keys look like
  CONUS/<Product>/<YYYYMMDD>/MRMS_<Product>_<YYYYMMDD>-<HHMMSS>.grib2.gz
so a lexical listing is a chronological one, and `start-after` lists only
what is newer than a given time: one small request per product per tick.
"""

from __future__ import annotations

import datetime as dt
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

BUCKET = 'noaa-mrms-pds'
REGION = 'us-east-1'
BASE_URL = f'https://{BUCKET}.s3.{REGION}.amazonaws.com'
USER_AGENT = 'SentinelMRMS/1.0 (+https://app.nationalwildfiretrackingteam.org)'
TIMEOUT_SECONDS = 20
MAX_OBJECT_BYTES = 64 * 1024 * 1024  # the largest MRMS CONUS file is a few MB

_S3_NS = '{http://s3.amazonaws.com/doc/2006-03-01/}'
_KEY_TIME = re.compile(r'_(\d{8})-(\d{6})\.grib2\.gz$')


class SourceError(RuntimeError):
    pass


def key_time(key: str) -> dt.datetime | None:
    m = _KEY_TIME.search(key)
    if not m:
        return None
    return dt.datetime.strptime(m.group(1) + m.group(2), '%Y%m%d%H%M%S').replace(tzinfo=dt.timezone.utc)


def frame_key(prefix: str, source: str, when: dt.datetime) -> str:
    """The object key a file for `when` would have (used as a `start-after` bound)."""
    return f'{prefix}{when:%Y%m%d}/MRMS_{source}_{when:%Y%m%d-%H%M%S}.grib2.gz'


class MrmsSource:
    def __init__(self, base_url: str = BASE_URL, opener=None):
        self.base_url = base_url
        self._open = opener or urllib.request.urlopen

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

    def list_keys(self, prefix: str, start_after: str | None = None) -> list[str]:
        """Every key under `prefix` after `start_after`, in order."""
        keys, token = [], None
        while True:
            params = {'list-type': '2', 'prefix': prefix}
            if start_after:
                params['start-after'] = start_after
            if token:
                params['continuation-token'] = token
            root = ET.fromstring(self._get(f'{self.base_url}/?{urllib.parse.urlencode(params)}'))
            keys += [el.text for el in root.iter(f'{_S3_NS}Key')]
            token = root.findtext(f'{_S3_NS}NextContinuationToken')
            if root.findtext(f'{_S3_NS}IsTruncated') != 'true' or not token:
                return keys

    def list_since(self, prefix: str, source: str, since: dt.datetime, until: dt.datetime) -> list[tuple[dt.datetime, str]]:
        """(time, key) for every file of a product with since < time <= until, oldest first.

        The bucket is partitioned by UTC day, so a window across midnight lists two days.
        """
        out = []
        day = since.date()
        while day <= until.date():
            day_prefix = f'{prefix}{day:%Y%m%d}/'
            after = frame_key(prefix, source, since) if day == since.date() else None
            for key in self.list_keys(day_prefix, after):
                t = key_time(key)
                if t and since < t <= until:
                    out.append((t, key))
            day += dt.timedelta(days=1)
        return sorted(out)

    def fetch(self, key: str) -> bytes:
        return self._get(f'{self.base_url}/{urllib.parse.quote(key)}')
