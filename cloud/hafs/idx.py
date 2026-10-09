"""
idx.py
Parses the wgrib2-style inventory (.idx) NOAA publishes beside every HAFS
GRIB2 file, so one field can be fetched with an HTTP Range request instead
of downloading the whole 250-900 MB file.

A line is `n:offset:d=YYYYMMDDHH:VAR:LEVEL:TIME:`, for example
  2:466336:d=2026100800:REFC:entire atmosphere (considered as a single layer):3 hour fcst:
  699:…:WIND:10 m above ground:2-3 hour max fcst:
  702:…:APCP:surface:0-3 hour acc fcst:
  703:…:APCP:surface:0-1 day acc fcst:
A message runs from its offset to the byte before the next line's offset;
the last one runs to the end of the file (its size comes from the listing).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_INSTANT = re.compile(r'^(\d+) (hour|day|min) fcst$')
_PERIOD = re.compile(r'^(\d+)-(\d+) (hour|day|min) (\w+) fcst$')
_UNIT_HOURS = {'hour': 1, 'day': 24, 'min': 1 / 60}


class IdxError(ValueError):
    pass


@dataclass(frozen=True)
class Entry:
    number: int
    start: int  # first byte of the message
    end: int | None  # last byte (inclusive); None until the file size is known
    reference: str  # YYYYMMDDHH
    var: str
    level: str
    time: str  # raw time text
    kind: str  # 'anl' | 'fcst' | the period statistic: 'max' | 'min' | 'ave' | 'acc' | …
    period_start: float | None  # hours after the run start
    period_end: float | None

    @property
    def size(self) -> int | None:
        return None if self.end is None else self.end - self.start + 1


def _time(text: str) -> tuple[str, float | None, float | None]:
    if text == 'anl':
        return 'anl', 0.0, 0.0
    m = _INSTANT.match(text)
    if m:
        h = int(m.group(1)) * _UNIT_HOURS[m.group(2)]
        return 'fcst', h, h
    m = _PERIOD.match(text)
    if m:
        u = _UNIT_HOURS[m.group(3)]
        return m.group(4), int(m.group(1)) * u, int(m.group(2)) * u
    return 'other', None, None


def parse_idx(text: str, file_size: int | None = None) -> list[Entry]:
    rows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split(':')
        if len(parts) < 6 or not parts[0].isdigit() or not parts[1].isdigit() or not parts[2].startswith('d='):
            raise IdxError(f'unexpected inventory line: {line[:80]!r}')
        rows.append(parts)
    if not rows:
        raise IdxError('empty inventory')
    entries = []
    for i, p in enumerate(rows):
        start = int(p[1])
        if i + 1 < len(rows):
            end = int(rows[i + 1][1]) - 1
        else:
            end = file_size - 1 if file_size else None
        if end is not None and end < start:
            raise IdxError('inventory offsets are not increasing')
        kind, a, b = _time(p[5])
        entries.append(Entry(int(p[0]), start, end, p[2][2:], p[3], p[4], p[5], kind, a, b))
    return entries


def find(entries: list[Entry], var: str, level: str, *, kind: str | None = None,
         period_start: float | None = None, period_end: float | None = None) -> Entry | None:
    """The first entry matching all given properties, or None."""
    for e in entries:
        if e.var != var or e.level != level:
            continue
        if kind is not None and e.kind != kind:
            continue
        if period_start is not None and e.period_start != period_start:
            continue
        if period_end is not None and e.period_end != period_end:
            continue
        return e
    return None
