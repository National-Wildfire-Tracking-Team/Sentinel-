"""Shared fixtures: the service directory on sys.path, synthetic HAFS GRIB2
messages, and an offline stand-in for the NOAA bucket.

`make_grib` writes the shape HAFS does: grid template 3.0 scanned south to
north (0x40), template 5.3 complex packing with second-order spatial
differencing (or 5.0 simple packing), and optionally a bitmap.
"""

import os
import struct
import sys

import numpy as np
import pytest

SERVICE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, SERVICE_DIR)

from source import NotFound, RunFile  # noqa: E402


def _section(number: int, body: bytes) -> bytes:
    return struct.pack('>IB', 5 + len(body), number) + body


def _sm(v: int, n: int) -> bytes:
    """Sign-and-magnitude, n octets."""
    top = 1 << (8 * n - 1)
    return ((top | -v) if v < 0 else v).to_bytes(n, 'big')


def _nbits(v: int) -> int:
    return int(v).bit_length()


class _Bits:
    def __init__(self):
        self.value, self.length = 0, 0

    def put(self, v: int, bits: int):
        if bits:
            self.value = (self.value << bits) | int(v)
            self.length += bits

    def pad(self):
        self.put(0, -self.length % 8)

    def bytes(self) -> bytes:
        self.pad()
        return self.value.to_bytes(self.length // 8, 'big') if self.length else b''


def _complex_spatial(ints: np.ndarray, group: int) -> tuple[bytes, bytes]:
    """Template 5.3 body (after octet 11) and section 7 data, order-2 differencing, R = 0, E = 0."""
    v = [int(x) for x in ints]
    d = [0, 0] + [v[i] - 2 * v[i - 1] + v[i - 2] for i in range(2, len(v))]
    gmin = min(d[2:]) if len(d) > 2 else 0
    dd = [0, 0] + [x - gmin for x in d[2:]]
    dd = dd[:len(v)]
    groups = [dd[i:i + group] for i in range(0, len(dd), group)]
    refs = [min(g) for g in groups]
    widths = [_nbits(max(g) - min(g)) for g in groups]
    lens = [len(g) for g in groups]
    ref_bits, width_bits = max(1, _nbits(max(refs))), max(1, _nbits(max(widths)))
    len_bits = _nbits(max(lens) - group) if max(lens) > group else 0
    nd = 4
    data = _sm(v[0], nd) + _sm(v[1] if len(v) > 1 else 0, nd) + _sm(gmin, nd)
    for seq, bits in ((refs, ref_bits), (widths, width_bits), ([n - group for n in lens], len_bits)):
        b = _Bits()
        for x in seq:
            b.put(x, bits)
        data += b.bytes()
    b = _Bits()
    for g, r, w in zip(groups, refs, widths):
        for x in g:
            b.put(x - r, w)
    data += b.bytes()
    s5 = (struct.pack('>f', 0.0) + _sm(0, 2) + _sm(1, 2) + bytes([ref_bits, 0, 1, 0]) + bytes(8)
          + struct.pack('>I', len(groups)) + bytes([0, width_bits]) + struct.pack('>IB', group, 1)
          + struct.pack('>IB', lens[-1], len_bits) + bytes([2, nd]))
    return s5, data


def make_grib(values: np.ndarray, *, lat_south=15.0, lon_west=260.0, step=0.5, template=3, group=7,
              ref_time=(2026, 10, 8, 6), category=3, parameter=1, bitmap=True) -> bytes:
    """One GRIB2 message. `values`: (ny, nx) float, NORTH row first, NaN = no data (a bitmap when `bitmap`)."""
    ny, nx = values.shape
    rows = values[::-1].reshape(-1)  # HAFS scans south to north
    mask = ~np.isnan(rows)
    if not bitmap and not mask.all():
        raise ValueError('NaN needs a bitmap')
    ints = np.rint(rows[mask] * 10).astype(np.int64)  # D = 1: one decimal
    y, mo, d, h = ref_time
    s1 = _section(1, struct.pack('>HHBBB', 7, 0, 2, 1, 1) + struct.pack('>HBBBBB', y, mo, d, h, 0, 0) + bytes([0, 1]))
    s3 = bytearray(72 - 5)
    s3[1:5] = struct.pack('>I', nx * ny)
    s3[25:33] = struct.pack('>II', nx, ny)
    lat_north = lat_south + (ny - 1) * step
    lon_east = lon_west + (nx - 1) * step
    s3[41:49] = struct.pack('>iI', round(lat_south * 1e6), round(lon_west * 1e6))
    s3[50:58] = struct.pack('>iI', round(lat_north * 1e6), round(lon_east * 1e6))
    s3[58:66] = struct.pack('>II', round(step * 1e6), round(step * 1e6))
    s3[66] = 0x40
    s4 = bytearray(34 - 5)
    s4[4], s4[5] = category, parameter
    if template == 3:
        s5_body, data = _complex_spatial(ints, group)
    else:
        lo = int(ints.min()) if ints.size else 0
        bits = max(1, _nbits(int(ints.max()) - lo)) if ints.size else 0
        b = _Bits()
        for x in ints:
            b.put(int(x) - lo, bits)
        data = b.bytes()
        s5_body = struct.pack('>f', float(lo)) + _sm(0, 2) + _sm(1, 2) + bytes([bits, 0])
    s5 = struct.pack('>IH', int(mask.sum()), template) + s5_body
    s6 = bytes([0]) + np.packbits(mask).tobytes() if bitmap else bytes([255])
    body = (s1 + _section(3, bytes(s3)) + _section(4, bytes(s4)) + _section(5, s5) + _section(6, s6)
            + _section(7, data) + b'7777')
    return b'GRIB' + bytes([0, 0, 0, 2]) + struct.pack('>Q', 16 + len(body)) + body


# ── an offline bucket ──

def storm_values(hour: int, ny=24, nx=32) -> dict:
    """Plausible fields for one hour: a low centred mid-grid that deepens with time; the nest's corner is masked."""
    yy, xx = np.mgrid[0:ny, 0:nx]
    r = np.hypot(yy - ny / 2, xx - nx / 2)
    mask = (yy < 4) & (xx < 6)
    def masked(a):
        a = a.astype(np.float64)
        a[mask] = np.nan
        return a
    return {
        'PRMSL': masked(101300 - (3000 + 50 * hour) * np.exp(-r / 6)),
        'UGRD': masked(20 * np.exp(-r / 8)),
        'VGRD': masked(15 * np.exp(-r / 8)),
        'REFC': masked(np.where(r < 6, 45.0, np.nan)),
        'APCP': masked(np.full((ny, nx), 2.0 * hour)),
    }


def idx_line(n, offset, cycle, var, level, time):
    return f'{n}:{offset}:d={cycle}:{var}:{level}:{time}:'


class FakeHafsFile:
    """One forecast-hour file: messages back to back and the .idx that indexes them."""

    def __init__(self, cycle: str, hour: int):
        t = 'anl' if hour == 0 else f'{hour} hour fcst'
        msgs = [
            ('PRMSL', 'mean sea level', t),
            ('UGRD', '10 m above ground', t),
            ('VGRD', '10 m above ground', t),
            ('REFC', 'entire atmosphere (considered as a single layer)', t),
        ]
        if hour > 0:
            msgs.append(('APCP', 'surface', f'0-{hour} hour acc fcst'))
        vals = storm_values(hour)
        self.data, lines = b'', []
        ref = (int(cycle[:4]), int(cycle[4:6]), int(cycle[6:8]), int(cycle[8:]))
        for i, (var, level, time) in enumerate(msgs, 1):
            lines.append(idx_line(i, len(self.data), cycle, var, level, time))
            self.data += make_grib(vals[var], ref_time=ref, template=3 if i % 2 else 0)
        self.idx = '\n'.join(lines) + '\n'


class FakeSource:
    """The NOAA bucket for a few runs, in memory. Records every read."""

    def __init__(self, runs: dict, *, modified='2026-10-08T09:00:00.000Z', names=None, fail=()):
        # runs: {(prefix, cycle): {storm: [hours]}}; domains 'storm' and 'parent' share the data.
        self.runs = runs
        self.modified = modified
        self.names = names or {}
        self.fail = set(fail)
        self.files = {}
        self.reads = []
        self.stats = {'requests': 0}

    def _file(self, prefix, cycle, storm, domain, hour):
        if hour not in self.runs.get((prefix, cycle), {}).get(storm, []):
            raise NotFound('HTTP 404')
        key = (cycle, hour)
        if key not in self.files:
            self.files[key] = FakeHafsFile(cycle, hour)
        return self.files[key]

    def list_cycles(self, prefix, day):
        self.reads.append(('cycles', prefix, day))
        return sorted(c for (p, c) in self.runs if p == prefix and c.startswith(day))

    def list_run(self, prefix, cycle):
        self.reads.append(('list', prefix, cycle))
        if 'list' in self.fail:
            from source import SourceError
            raise SourceError('HTTPError: 503')
        out = []
        for storm, hours in self.runs.get((prefix, cycle), {}).items():
            for domain in ('parent', 'storm'):
                for h in hours:
                    out.append(RunFile(storm, domain, h, len(self._file(prefix, cycle, storm, domain, h).data),
                                       self.modified, True))
        return sorted(out, key=lambda f: (f.storm, f.domain, f.hour))

    def fetch_idx(self, prefix, cycle, storm, domain, hour):
        self.reads.append(('idx', cycle, storm, domain, hour))
        return self._file(prefix, cycle, storm, domain, hour).idx

    def fetch_range(self, prefix, cycle, storm, domain, hour, start, end):
        self.reads.append(('range', cycle, storm, domain, hour, start, end))
        if 'range' in self.fail:
            from source import SourceError
            raise SourceError('HTTPError: 503')
        data = self._file(prefix, cycle, storm, domain, hour).data
        if end >= len(data):  # S3 answers with fewer bytes, which HafsSource rejects as a short response
            from source import SourceError
            raise SourceError('short range response')
        return data[start:end + 1]

    def fetch_storm_info(self, prefix, cycle, storm):
        if storm not in self.names:
            raise NotFound('HTTP 404')
        return f'{self.names[storm]}{storm}\n'


@pytest.fixture
def grib():
    return make_grib
