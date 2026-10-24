"""
fems.py
NFDRS station values from the USDA Forest Service Fire Environment Mapping
System (FEMS, https://fems.fs2c.usda.gov). Public, no key.

Two calls, both observed working anonymously (2026-10):
  POST /api/climatology/graphql            stationMetaData: id, name, lat/lon, state, status
  GET  /api/ext-climatology/download-nfdr-daily-summary/?...&dataFormat=csv
       per-station NFDRS 2016 daily summary: observed days (NFDRType O) and
       the 7-day forecast (F), for the fuel model asked for (Y here).

The CSV columns are FEMS's own; nothing is derived here except a trend
(the change over the observed window). A blank cell stays None: values are
never filled in, and a station with no observed day in the window is
listed as having no current data rather than dropped silently.

FEMS publishes no rate limit; requests are batched (50 stations, one at a
time) so a full national pull is ~42 small requests.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import urllib.parse
import urllib.request

BASE_URL = 'https://fems.fs2c.usda.gov'
GRAPHQL_PATH = '/api/climatology/graphql'
SUMMARY_PATH = '/api/ext-climatology/download-nfdr-daily-summary/'
USER_AGENT = 'SentinelFireDanger/1.0 (+https://app.nationalwildfiretrackingteam.org)'
TIMEOUT_SECONDS = 30
MAX_RESPONSE_BYTES = 16 * 1024 * 1024
BATCH_SIZE = 50
# One NFDRS 2016 fuel model requested for every station, so values compare
# across the map. A station's locally used fuel model can differ (and local
# danger ratings use local breakpoints), which the UI says.
FUEL_MODEL = 'Y'
HISTORY_DAYS = 14

# FEMS column → our field. Only these are kept.
NUMERIC_COLUMNS = {
    '1HrFM': 'fm1',
    '10HrFM': 'fm10',
    '100HrFM': 'fm100',
    '1000HrFM': 'fm1000',
    'HerbFM': 'herbFM',
    'WoodyFM': 'woodyFM',
    'KBDI': 'kbdi',
    'GSI': 'gsi',
    'IC': 'ic',
    'ERC': 'erc',
    'SC': 'sc',
    'BI': 'bi',
}

STATION_QUERY = '{ stationMetaData(per_page: 5000) { data { station_id station_name latitude longitude state station_status } } }'


class SourceError(RuntimeError):
    pass


class FemsSource:
    def __init__(self, base_url: str = BASE_URL, opener=None):
        self.base_url = base_url
        self._open = opener or urllib.request.urlopen

    def _request(self, req: urllib.request.Request) -> bytes:
        req.add_header('User-Agent', USER_AGENT)
        try:
            with self._open(req, timeout=TIMEOUT_SECONDS) as res:
                body = res.read(MAX_RESPONSE_BYTES + 1)
        except Exception as exc:  # URLError, HTTPError, timeouts
            raise SourceError(f'{type(exc).__name__}: {exc}') from exc
        if len(body) > MAX_RESPONSE_BYTES:
            raise SourceError('response too large')
        return body

    def stations(self) -> list[dict]:
        # FEMS's CSRF guard only lets JSON content types through.
        req = urllib.request.Request(
            self.base_url + GRAPHQL_PATH,
            data=json.dumps({'query': STATION_QUERY}).encode(),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            payload = json.loads(self._request(req))
            return payload['data']['stationMetaData']['data']
        except (ValueError, KeyError, TypeError) as exc:
            raise SourceError(f'unexpected station metadata: {exc}') from exc

    def daily_summary(self, station_ids: list[int], start: dt.date, end: dt.date) -> str:
        query = urllib.parse.urlencode({
            'dataset': 'all',
            'startDate': f'{start.isoformat()}T00:00:00Z',
            'endDate': f'{end.isoformat()}T00:00:00Z',
            'dataFormat': 'csv',
            'stationIds': ','.join(str(s) for s in station_ids),
            'fuelModels': FUEL_MODEL,
        }, safe=',:')
        body = self._request(urllib.request.Request(f'{self.base_url}{SUMMARY_PATH}?{query}'))
        text = body.decode('utf-8-sig')
        if not text.startswith('"StationName"'):
            raise SourceError(f'unexpected summary response: {text[:80]!r}')
        return text


def active_stations(metadata: list[dict]) -> list[dict]:
    """Active stations with usable coordinates, normalized."""
    out = []
    for s in metadata:
        if s.get('station_status') != 'A':
            continue
        lat, lon = s.get('latitude'), s.get('longitude')
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
            continue
        out.append({
            'id': int(s['station_id']),
            'name': (s.get('station_name') or '').strip(),
            'state': s.get('state'),
            'lat': round(float(lat), 5),
            'lon': round(float(lon), 5),
        })
    return out


def _num(value: str):
    value = (value or '').strip()
    if not value:
        return None
    try:
        return round(float(value), 2)
    except ValueError:
        return None


def parse_summary(text: str) -> dict[int, dict[str, list[dict]]]:
    """
    CSV → {station_id: {'observed': [day, …], 'forecast': [day, …]}}, each
    list in date order. A day is {'date': 'YYYY-MM-DD', 'qa': str, <fields>}.
    Rows with no NFDRType (FEMS pads the end of the range) are skipped.
    """
    out: dict[int, dict[str, list[dict]]] = {}
    for row in csv.DictReader(io.StringIO(text)):
        kind = (row.get('NFDRType') or '').strip()
        if kind not in ('O', 'F'):
            continue
        try:
            sid = int(row['StationId'])
        except (KeyError, ValueError):
            continue
        day = {'date': (row.get('ObservationTime') or '').strip()[:10], 'qa': (row.get('NFDRQAFlag') or '').strip() or None}
        for col, field in NUMERIC_COLUMNS.items():
            day[field] = _num(row.get(col, ''))
        station = out.setdefault(sid, {'observed': [], 'forecast': []})
        station['observed' if kind == 'O' else 'forecast'].append(day)
    for station in out.values():
        station['observed'].sort(key=lambda d: d['date'])
        station['forecast'].sort(key=lambda d: d['date'])
    return out


def trend(observed: list[dict], field: str, days: int = 7):
    """Change in `field` from `days` before the latest observed day to that day, or None if either is missing."""
    by_date = {d['date']: d.get(field) for d in observed}
    if not observed:
        return None
    latest = observed[-1]
    try:
        then = (dt.date.fromisoformat(latest['date']) - dt.timedelta(days=days)).isoformat()
    except ValueError:
        return None
    a, b = by_date.get(then), latest.get(field)
    if a is None or b is None:
        return None
    return round(b - a, 2)


def batches(items: list, size: int = BATCH_SIZE):
    for i in range(0, len(items), size):
        yield items[i:i + size]
