"""
grib2.py
A GRIB2 decoder for NOAA HAFS model output, so the Lambda bundle needs only
numpy (no eccodes), like cloud/mrms/grib2.py.

HAFS writes its fields differently from MRMS, so this is its own reader:
  - grid template 3.0, a regular latitude/longitude grid, scanned west to
    east and SOUTH TO NORTH (scan mode 0x40). The storm-following nest is
    0.02° (1001 × 801 today), the parent domain 0.06° (1681 × 1361);
  - data representation template 5.3, complex packing with spatial
    differencing (5.0 simple and 5.2 complex packing are handled too, since
    they share the same machinery);
  - often a bitmap (section 6): composite reflectivity, for one, carries only
    the points with an echo.

Input is one GRIB2 message, as retrieved with a byte-range request using
the file's .idx inventory (idx.py). Output values are float32, NaN where the
bitmap or the missing-value convention says there's no data, rows north
first. Anything outside these shapes raises UnsupportedGrib rather than
decoding wrongly.

Spec: WMO Manual on Codes, FM 92 GRIB edition 2, templates 3.0, 4.0/4.8,
5.0/5.2/5.3, 7.0/7.2/7.3 (https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/).
"""

from __future__ import annotations

import datetime as dt
import struct
from dataclasses import dataclass

import numpy as np


class UnsupportedGrib(ValueError):
    """The bytes are GRIB2, but not in a shape this reader handles (or are corrupt)."""


@dataclass(frozen=True)
class LatLonGrid:
    """A regular lat/lon grid, described north row first (after any flip)."""

    nx: int
    ny: int
    lat_north: float  # centre of the northernmost row
    lon_west: float  # centre of the westernmost column, −180 ≤ lon < 180
    dlat: float
    dlon: float

    @property
    def lat_south(self) -> float:
        return self.lat_north - (self.ny - 1) * self.dlat

    @property
    def lon_east(self) -> float:
        """Centre of the easternmost column; may exceed 180 for a grid across the antimeridian."""
        return self.lon_west + (self.nx - 1) * self.dlon

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        """Outer cell edges: (west, south, east, north)."""
        return (self.lon_west - self.dlon / 2, self.lat_south - self.dlat / 2,
                self.lon_east + self.dlon / 2, self.lat_north + self.dlat / 2)


@dataclass
class Field:
    reference_time: dt.datetime
    discipline: int
    category: int
    parameter: int
    product_template: int
    grid: LatLonGrid
    values: np.ndarray  # (ny, nx) float32, north row first, NaN = no data


def _u(b: bytes) -> int:
    return int.from_bytes(b, 'big')


def _s(b: bytes) -> int:
    """GRIB2 signed integers are sign-and-magnitude, not two's complement."""
    v = int.from_bytes(b, 'big')
    top = 1 << (8 * len(b) - 1)
    return -(v & (top - 1)) if v & top else v


def _sections(msg: bytes):
    if len(msg) < 16 or msg[:4] != b'GRIB' or msg[7] != 2:
        raise UnsupportedGrib('not a GRIB edition 2 message')
    total = struct.unpack('>Q', msg[8:16])[0]
    if total > len(msg):
        raise UnsupportedGrib('truncated GRIB2 message')
    pos = 16
    while pos <= total - 4:
        if msg[pos:pos + 4] == b'7777':
            return
        length = struct.unpack('>I', msg[pos:pos + 4])[0]
        if length < 5 or pos + length > total:
            raise UnsupportedGrib('corrupt GRIB2 section length')
        yield msg[pos + 4], msg[pos:pos + length]
        pos += length
    raise UnsupportedGrib('GRIB2 message has no end marker')


def _grid(s3: bytes) -> tuple[LatLonGrid, bool]:
    """Section 3 → (grid north-first, rows_south_first)."""
    if _u(s3[12:14]) != 0:
        raise UnsupportedGrib(f'grid template 3.{_u(s3[12:14])}: only regular lat/lon (3.0) is supported')
    nx, ny = _u(s3[30:34]), _u(s3[34:38])
    basic, subdiv = _u(s3[38:42]), _u(s3[42:46])
    unit = 1e-6 if basic in (0, 0xFFFFFFFF) or subdiv in (0, 0xFFFFFFFF) else basic / subdiv
    la1, lo1 = _s(s3[46:50]) * unit, _u(s3[50:54]) * unit
    la2, lo2 = _s(s3[55:59]) * unit, _u(s3[59:63]) * unit
    scan = s3[71]
    if scan & 0xB0:  # −i, j-consecutive or boustrophedon
        raise UnsupportedGrib(f'unsupported scanning mode {scan:#04x}')
    if nx < 2 or ny < 2 or nx * ny > 50_000_000:
        raise UnsupportedGrib(f'implausible grid size {nx} × {ny}')
    # Spacing from the corner points: the stored increments are rounded to
    # 1e-6° (HAFS writes 0.019999 for its 0.02° nest).
    span_lon = (lo2 - lo1) % 360
    dlon = span_lon / (nx - 1)
    dlat = abs(la2 - la1) / (ny - 1)
    south_first = bool(scan & 0x40)
    lat_north = la2 if south_first else la1
    if (south_first and la2 < la1) or (not south_first and la1 < la2):
        raise UnsupportedGrib('grid corners disagree with the scanning mode')
    lon_west = ((lo1 + 180) % 360) - 180
    return LatLonGrid(nx, ny, lat_north, lon_west, dlat, dlon), south_first


def _bits(data: bytes, offsets: np.ndarray, widths: np.ndarray) -> np.ndarray:
    """Unsigned integers of `widths` bits starting at bit `offsets` (MSB first), vectorized."""
    out = np.zeros(offsets.shape, np.uint64)
    if offsets.size == 0:
        return out
    if int(widths.max()) > 56:
        raise UnsupportedGrib('packed values wider than 56 bits')
    buf = np.frombuffer(data + b'\0' * 8, np.uint8)
    byte = (offsets >> 3).astype(np.int64)
    if byte.size and int(byte.max()) + 8 > buf.size:
        raise UnsupportedGrib('packed data runs past the end of section 7')
    window = np.zeros(offsets.shape, np.uint64)
    for k in range(8):
        window = (window << np.uint64(8)) | buf[byte + k].astype(np.uint64)
    shift = np.uint64(64) - (offsets & 7).astype(np.uint64) - widths.astype(np.uint64)
    mask = (np.uint64(1) << widths.astype(np.uint64)) - np.uint64(1)
    nz = widths > 0
    out[nz] = (window[nz] >> shift[nz]) & mask[nz]
    return out


def _simple(s5: bytes, s7: bytes, n: int) -> tuple[np.ndarray, np.ndarray]:
    nbits = s5[19]
    if nbits == 0:
        return np.zeros(n, np.int64), np.zeros(n, bool)
    offsets = np.arange(n, dtype=np.int64) * nbits
    return _bits(s7[5:], offsets, np.full(n, nbits, np.int64)).astype(np.int64), np.zeros(n, bool)


def _complex(s5: bytes, s7: bytes, n: int, spatial: bool) -> tuple[np.ndarray, np.ndarray]:
    """Templates 5.2/5.3 → (scaled integers before R/E/D, missing mask), length n."""
    ref_bits = s5[19]
    if s5[21] != 1:
        raise UnsupportedGrib('only general group splitting (method 1) is supported')
    missing_mode = s5[22]
    if missing_mode not in (0, 1, 2):
        raise UnsupportedGrib(f'missing value management {missing_mode}')
    ng = _u(s5[31:35])
    width_ref, width_bits = s5[35], s5[36]
    len_ref, len_inc, len_last, len_bits = _u(s5[37:41]), s5[41], _u(s5[42:46]), s5[46]
    data = s7[5:]
    pos = 0
    order = 0
    h = []
    gmin = 0
    if spatial:
        order, ndesc = s5[47], s5[48]
        if order not in (1, 2) or ndesc == 0:
            raise UnsupportedGrib(f'spatial differencing order {order}, {ndesc} octets')
        for _ in range(order):
            h.append(_s(data[pos:pos + ndesc]))
            pos += ndesc
        gmin = _s(data[pos:pos + ndesc])
        pos += ndesc
    if ng == 0:
        raise UnsupportedGrib('complex packing with no groups')

    def field_of(count, bits, start_byte):
        offs = start_byte * 8 + np.arange(count, dtype=np.int64) * bits
        vals = _bits(data, offs, np.full(count, bits, np.int64)).astype(np.int64)
        return vals, start_byte + (count * bits + 7) // 8

    refs, pos = field_of(ng, ref_bits, pos)
    widths, pos = field_of(ng, width_bits, pos)
    lens, pos = field_of(ng, len_bits, pos)
    widths = widths + width_ref
    lens = lens * len_inc + len_ref
    lens[-1] = len_last
    if int(lens.sum()) != n:
        raise UnsupportedGrib(f'group lengths sum to {int(lens.sum())}, expected {n}')

    # Bit offset of every packed value: groups are back to back, no padding.
    vwidth = np.repeat(widths, lens)
    offsets = pos * 8 + np.concatenate(([0], np.cumsum(vwidth[:-1], dtype=np.int64)))
    packed = _bits(data, offsets, vwidth).astype(np.int64)
    gref = np.repeat(refs, lens)

    missing = np.zeros(n, bool)
    if missing_mode:
        # Width-0 groups mark missing with an all-ones reference; others with all-ones values.
        ref_ones = (1 << ref_bits) - 1
        val_ones = (np.int64(1) << vwidth) - 1
        zero_w = vwidth == 0
        missing |= zero_w & (gref == ref_ones)
        missing |= ~zero_w & (packed == val_ones)
        if missing_mode == 2:
            missing |= zero_w & (gref == ref_ones - 1)
            missing |= ~zero_w & (packed == val_ones - 1)
    x = gref + packed

    if spatial:
        # Undo spatial differencing over the non-missing values only, in order.
        #   order 1: v0 = h1;           v[i] = v[i-1] + d[i]
        #   order 2: v0 = h1, v1 = h2;  v[i] = d[i] + 2·v[i-1] − v[i-2]
        # where d[i] = packed value + overall minimum. Order 2 is a running sum
        # of first differences w[i] = v[i] − v[i-1], with w[1] = h2 − h1.
        valid = np.flatnonzero(~missing)
        d = x[valid] + gmin
        v = np.zeros(d.size, np.int64)
        if d.size:
            v[0] = h[0]
        if order == 1 and d.size > 1:
            v[1:] = h[0] + np.cumsum(d[1:])
        elif order == 2 and d.size > 1:
            w = (h[1] - h[0]) + np.concatenate(([0], np.cumsum(d[2:])))
            v[1:] = h[0] + np.cumsum(w)
        x = np.zeros(n, np.int64)
        x[valid] = v
    return x, missing


def decode(msg: bytes) -> Field:
    """Decode one GRIB2 message (one field)."""
    discipline = msg[6] if len(msg) > 6 else -1
    found = {}
    for number, sec in _sections(msg):
        if number in (3, 4, 5, 6, 7) and number in found:
            raise UnsupportedGrib('more than one field in the message; fetch one idx entry at a time')
        found[number] = sec
    for needed in (1, 3, 4, 5, 6, 7):
        if needed not in found:
            raise UnsupportedGrib(f'missing section {needed}')
    s1, s3, s4, s5, s6, s7 = (found[k] for k in (1, 3, 4, 5, 6, 7))

    reference_time = dt.datetime(_u(s1[12:14]), s1[14], s1[15], s1[16], s1[17], s1[18], tzinfo=dt.timezone.utc)
    grid, south_first = _grid(s3)
    npts = grid.nx * grid.ny

    n = _u(s5[5:9])  # values actually packed (bitmap points only)
    template = _u(s5[9:11])
    reference_value = struct.unpack('>f', s5[11:15])[0]
    e, d = _s(s5[15:17]), _s(s5[17:19])
    if template == 0:
        x, missing = _simple(s5, s7, n)
    elif template in (2, 3):
        x, missing = _complex(s5, s7, n, spatial=template == 3)
    else:
        raise UnsupportedGrib(f'data representation template 5.{template} is not supported')

    vals = ((reference_value + x.astype('float64') * 2.0 ** e) / 10.0 ** d).astype('float32')
    vals[missing] = np.nan

    indicator = s6[5]
    if indicator == 255:
        if n != npts:
            raise UnsupportedGrib(f'{n} values for a {npts}-point grid and no bitmap')
        full = vals
    elif indicator == 0:
        bitmap = np.unpackbits(np.frombuffer(s6[6:], np.uint8))[:npts].astype(bool)
        if int(bitmap.sum()) != n:
            raise UnsupportedGrib('bitmap and packed value count disagree')
        full = np.full(npts, np.nan, np.float32)
        full[bitmap] = vals
    else:
        raise UnsupportedGrib(f'bitmap indicator {indicator} (predefined/previous bitmaps) is not supported')

    values = full.reshape(grid.ny, grid.nx)
    if south_first:
        values = values[::-1]
    return Field(
        reference_time=reference_time, discipline=discipline, category=s4[9], parameter=s4[10],
        product_template=_u(s4[7:9]), grid=grid, values=np.ascontiguousarray(values),
    )


def read_grid(head: bytes) -> LatLonGrid:
    """The grid of the first message in a file, from just its first few hundred bytes.

    Sections 0-3 sit at the start of every message, so a small range read of a
    file's head gives the exact grid (and so the frame corners) without
    downloading or decoding any data.
    """
    if len(head) < 16 or head[:4] != b'GRIB' or head[7] != 2:
        raise UnsupportedGrib('not a GRIB edition 2 message')
    pos = 16
    while pos + 5 <= len(head):
        length = struct.unpack('>I', head[pos:pos + 4])[0]
        number = head[pos + 4]
        if length < 5:
            raise UnsupportedGrib('corrupt GRIB2 section length')
        if number == 3:
            if pos + length > len(head):
                break
            return _grid(head[pos:pos + length])[0]
        if number > 3:
            break
        pos += length
    raise UnsupportedGrib('grid section not within the bytes read')
