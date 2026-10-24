"""
wfpi.py
Valid dates for the USGS EROS Wildland Fire Potential Index (WFPI) forecast
layers, so the map can label each day. The tiles themselves are drawn by
USGS's GeoServer (through the /api/arcgis/usgs-wfpi-* edge routes); this
only reads each layer's WMS time dimension.

Observed shape (2026-10-20): one layer per forecast day,
`firedanger_wfpi-forecast-<N>_conus_day_data`, each with a daily ISO time
dimension whose default is "current" (its newest time). The newest time of
layer N is the newest time of layer 1 plus N-1 days, i.e. day N of USGS's
newest run. That relationship is checked on every run (layers 1 and 7); if
it doesn't hold, no dates are published rather than wrong ones.

WFPI is a USGS model ("a unit-less number that ranges from 0 to 150 and
relates to vegetation flammability"), not an NFDRS index.
"""

from __future__ import annotations

import datetime as dt
import re
import urllib.request

BASE = 'https://dmsdata.cr.usgs.gov/geoserver/firedanger_wfpi-forecast-{n}_conus_day_data/wms'
USER_AGENT = 'SentinelFireDanger/1.0 (+https://app.nationalwildfiretrackingteam.org)'
TIMEOUT_SECONDS = 60
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
DAYS = 7

_TIME_DIM = re.compile(r'<Dimension[^>]*name="time"[^>]*>([^<]+)</Dimension>')


class SourceError(RuntimeError):
    pass


class WfpiSource:
    def __init__(self, opener=None):
        self._open = opener or urllib.request.urlopen

    def capabilities(self, n: int) -> str:
        url = BASE.format(n=n) + '?service=WMS&request=GetCapabilities&version=1.3.0'
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        try:
            with self._open(req, timeout=TIMEOUT_SECONDS) as res:
                body = res.read(MAX_RESPONSE_BYTES + 1)
        except Exception as exc:  # URLError, HTTPError, timeouts
            raise SourceError(f'{type(exc).__name__}: {exc}') from exc
        if len(body) > MAX_RESPONSE_BYTES:
            raise SourceError('capabilities too large')
        return body.decode('utf-8', 'replace')


def newest_time(capabilities_xml: str) -> dt.date:
    m = _TIME_DIM.search(capabilities_xml)
    if not m:
        raise SourceError('no time dimension in capabilities')
    try:
        times = [dt.date.fromisoformat(t.strip()[:10]) for t in m.group(1).split(',') if t.strip()]
    except ValueError as exc:
        raise SourceError(f'unreadable time dimension: {exc}') from exc
    if not times:
        raise SourceError('empty time dimension')
    return max(times)


def valid_dates(source: WfpiSource) -> list[str]:
    """Valid date of each forecast day 1-7 of the newest run, checked against layer 7."""
    first = newest_time(source.capabilities(1))
    last = newest_time(source.capabilities(DAYS))
    if (last - first).days != DAYS - 1:
        raise SourceError(f'layers out of step: day 1 newest {first}, day {DAYS} newest {last}')
    return [(first + dt.timedelta(days=i)).isoformat() for i in range(DAYS)]
