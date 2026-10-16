"""
source.py
Reads NOAA HAFS output with plain unsigned HTTPS: no AWS credentials, no SDK.

  Listings and data: s3://noaa-nws-hafs-pds (AWS Open Data, us-east-1), the
                     primary source. The service runs in us-east-1, so reads
                     stay in-region.
  Data fallback:     NOMADS (nomads.ncep.noaa.gov), the same file names, used
                     only when a read from the bucket fails. NOMADS has no
                     machine-readable listing, so discovery is bucket-only.

Every URL is built here from validated parts (model prefix from models.py,
digits-only cycle, storm id matching STORM_RE, a known domain, an hour);
nothing a caller sends becomes a host or a free-form path.
"""

from __future__ import annotations

import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass

BUCKET = 'noaa-nws-hafs-pds'
REGION = 'us-east-1'
BASE_URL = f'https://{BUCKET}.s3.{REGION}.amazonaws.com'
NOMADS_URL = 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/hafs/prod'
USER_AGENT = 'SentinelHAFS/1.0 (+https://app.nationalwildfiretrackingteam.org)'
TIMEOUT_SECONDS = 20
MAX_LISTING_BYTES = 8 * 1024 * 1024
MAX_RANGE_BYTES = 16 * 1024 * 1024  # one field; the largest seen is ~2.3 MB (parent domain)
MAX_SMALL_BYTES = 1024 * 1024  # .idx and storm_info files (~40 KB)
RETRIES = 2

STORM_RE = re.compile(r'^\d{2}[a-z]$')
CYCLE_RE = re.compile(r'^\d{10}$')
_S3_NS = '{http://s3.amazonaws.com/doc/2006-03-01/}'
_FILE_RE = re.compile(r'/(\d{2}[a-z])\.(\d{10})\.([a-z]+)\.([a-z]+)\.atm\.f(\d{3})\.grb2(\.idx)?$')


class SourceError(RuntimeError):
    pass


class NotFound(SourceError):
    pass


@dataclass(frozen=True)
class RunFile:
    storm: str
    domain: str
    hour: int
    size: int
    last_modified: str  # ISO 8601 from the listing
    has_idx: bool


def _check(model_prefix: str, cycle: str, storm: str | None = None, domain: str | None = None):
    if not re.fullmatch(r'[a-z]{3,8}', model_prefix) or not CYCLE_RE.match(cycle):
        raise ValueError('invalid model or cycle')
    if storm is not None and not STORM_RE.match(storm):
        raise ValueError('invalid storm id')
    if domain is not None and not re.fullmatch(r'[a-z]{3,12}', domain):
        raise ValueError('invalid domain')


def file_name(model_prefix: str, cycle: str, storm: str, domain: str, hour: int) -> str:
    _check(model_prefix, cycle, storm, domain)
    if not 0 <= hour <= 999:
        raise ValueError('invalid hour')
    return f'{storm}.{cycle}.{model_prefix}.{domain}.atm.f{hour:03d}.grb2'


def bucket_key(model_prefix: str, cycle: str, name: str) -> str:
    return f'{model_prefix}/{cycle[:8]}/{cycle[8:]}/{name}'


def nomads_url(model_prefix: str, cycle: str, name: str) -> str:
    return f'{NOMADS_URL}/{model_prefix}.{cycle[:8]}/{cycle[8:]}/{name}'


class HafsSource:
    def __init__(self, base_url: str = BASE_URL, nomads: str | None = NOMADS_URL, opener=None, sleep=time.sleep):
        self.base_url = base_url
        self.nomads = nomads
        self._open = opener or urllib.request.urlopen
        self._sleep = sleep
        self.stats = {'requests': 0, 'bytes': 0, 'retries': 0, 'fallbacks': 0}

    def _get(self, url: str, *, limit: int, byte_range: tuple[int, int] | None = None) -> bytes:
        headers = {'User-Agent': USER_AGENT}
        if byte_range:
            headers['Range'] = f'bytes={byte_range[0]}-{byte_range[1]}'
        last = None
        for attempt in range(RETRIES + 1):
            if attempt:
                self.stats['retries'] += 1
                self._sleep(0.3 * attempt)
            self.stats['requests'] += 1
            try:
                with self._open(urllib.request.Request(url, headers=headers), timeout=TIMEOUT_SECONDS) as res:
                    status = getattr(res, 'status', 200)
                    body = res.read(limit + 1)
            except urllib.error.HTTPError as exc:
                if exc.code in (403, 404):  # S3 answers 403 for a missing key when listing isn't allowed
                    raise NotFound(f'HTTP {exc.code}') from exc
                last = exc
                if exc.code < 500 and exc.code != 429:
                    break
                continue
            except Exception as exc:  # URLError, connection resets, timeouts
                last = exc
                continue
            if len(body) > limit:
                raise SourceError('response larger than expected')
            if byte_range and status != 206:
                raise SourceError(f'range request answered with HTTP {status}')
            if byte_range and len(body) != byte_range[1] - byte_range[0] + 1:
                raise SourceError('short range response')
            self.stats['bytes'] += len(body)
            return body
        raise SourceError(f'{type(last).__name__}: {last}')

    def _data(self, model_prefix: str, cycle: str, name: str, *, limit: int, byte_range=None) -> bytes:
        """A data read from the bucket, falling back to NOMADS if the bucket fails (not if it says 'missing')."""
        try:
            return self._get(f'{self.base_url}/{urllib.parse.quote(bucket_key(model_prefix, cycle, name))}',
                             limit=limit, byte_range=byte_range)
        except NotFound:
            raise
        except SourceError:
            if not self.nomads:
                raise
            self.stats['fallbacks'] += 1
            return self._get(nomads_url(model_prefix, cycle, name), limit=limit, byte_range=byte_range)

    # ── listings ──

    def _list(self, prefix: str, delimiter: str | None = None) -> tuple[list[tuple[str, int, str]], list[str]]:
        objects, prefixes, token = [], [], None
        while True:
            params = {'list-type': '2', 'prefix': prefix}
            if delimiter:
                params['delimiter'] = delimiter
            if token:
                params['continuation-token'] = token
            root = ET.fromstring(self._get(f'{self.base_url}/?{urllib.parse.urlencode(params)}', limit=MAX_LISTING_BYTES))
            for c in root.iter(f'{_S3_NS}Contents'):
                objects.append((c.findtext(f'{_S3_NS}Key'), int(c.findtext(f'{_S3_NS}Size') or 0),
                                c.findtext(f'{_S3_NS}LastModified') or ''))
            prefixes += [p.findtext(f'{_S3_NS}Prefix') for p in root.iter(f'{_S3_NS}CommonPrefixes')]
            token = root.findtext(f'{_S3_NS}NextContinuationToken')
            if root.findtext(f'{_S3_NS}IsTruncated') != 'true' or not token:
                return objects, prefixes

    def list_cycles(self, model_prefix: str, day: str) -> list[str]:
        """Cycles ('YYYYMMDDHH') with a directory for this UTC day ('YYYYMMDD')."""
        if not re.fullmatch(r'[a-z]{3,8}', model_prefix) or not re.fullmatch(r'\d{8}', day):
            raise ValueError('invalid model or day')
        _, prefixes = self._list(f'{model_prefix}/{day}/', delimiter='/')
        out = []
        for p in prefixes:
            m = re.fullmatch(rf'{model_prefix}/{day}/(\d{{2}})/', p or '')
            if m:
                out.append(day + m.group(1))
        return sorted(out)

    def list_run(self, model_prefix: str, cycle: str) -> list[RunFile]:
        """Every forecast-hour GRIB2 file in a cycle, for every storm and domain."""
        _check(model_prefix, cycle)
        objects, _ = self._list(f'{model_prefix}/{cycle[:8]}/{cycle[8:]}/')
        grbs, idxs = {}, set()
        for key, size, modified in objects:
            m = _FILE_RE.search('/' + key)
            if not m or m.group(2) != cycle or m.group(3) != model_prefix:
                continue
            ident = (m.group(1), m.group(4), int(m.group(5)))
            if m.group(6):
                idxs.add(ident)
            else:
                grbs[ident] = (size, modified)
        return sorted(
            (RunFile(s, d, h, size, modified, (s, d, h) in idxs) for (s, d, h), (size, modified) in grbs.items()),
            key=lambda f: (f.storm, f.domain, f.hour))

    # ── data ──

    def fetch_idx(self, model_prefix: str, cycle: str, storm: str, domain: str, hour: int) -> str:
        name = file_name(model_prefix, cycle, storm, domain, hour) + '.idx'
        return self._data(model_prefix, cycle, name, limit=MAX_SMALL_BYTES).decode('ascii', 'replace')

    def fetch_range(self, model_prefix: str, cycle: str, storm: str, domain: str, hour: int, start: int, end: int) -> bytes:
        if start < 0 or end < start or end - start + 1 > MAX_RANGE_BYTES:
            raise SourceError('implausible byte range')
        name = file_name(model_prefix, cycle, storm, domain, hour)
        return self._data(model_prefix, cycle, name, limit=MAX_RANGE_BYTES, byte_range=(start, end))

    def fetch_storm_info(self, model_prefix: str, cycle: str, storm: str) -> str:
        _check(model_prefix, cycle, storm)
        name = f'{storm}.{cycle}.{model_prefix}.storm_info'
        return self._data(model_prefix, cycle, name, limit=MAX_SMALL_BYTES).decode('ascii', 'replace')
