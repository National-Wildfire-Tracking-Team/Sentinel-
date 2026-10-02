"""
grib2.py
A minimal GRIB2 reader for NOAA MRMS products, so the Lambda bundle needs no
eccodes.

MRMS writes every product the same way, which keeps this small:
  - one message per file (gzipped);
  - grid template 3.0, a regular latitude/longitude grid, scanned north to
    south and west to east (0.01° for most CONUS products, 0.005° for
    rotation tracks);
  - data representation template 5.41: the packed integers are a PNG image
    (8- or 16-bit greyscale) in section 7, with no bitmap.

Physical value = (R + X · 2^E) / 10^D, where X is the PNG pixel, R the
reference value, E the binary and D the decimal scale factor. The mapping is
monotonic in X, so the builder can max-pool the raw integers and convert
afterwards. Anything outside that shape raises UnsupportedGrib rather than
decoding wrongly.
"""

from __future__ import annotations

import datetime as dt
import gzip
import io
import struct
from dataclasses import dataclass

import numpy as np
from PIL import Image

# Rotation tracks are 14000 × 7000 (98 M pixels), above Pillow's default
# decompression-bomb limit. Keep a limit, just above the largest MRMS grid.
Image.MAX_IMAGE_PIXELS = 120_000_000


class UnsupportedGrib(ValueError):
    """The file is valid GRIB2 but not in the shape this reader handles."""


@dataclass(frozen=True)
class LatLonGrid:
    nx: int
    ny: int
    lat1: float  # centre of the first (northernmost) row
    lon1: float  # centre of the first (westernmost) column, −180…180
    dlat: float
    dlon: float

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        """Outer cell edges: (west, south, east, north)."""
        west = self.lon1 - self.dlon / 2
        north = self.lat1 + self.dlat / 2
        return (west, north - self.ny * self.dlat, west + self.nx * self.dlon, north)


@dataclass
class Field:
    reference_time: dt.datetime
    discipline: int
    category: int
    parameter: int
    grid: LatLonGrid
    packed: np.ndarray  # (ny, nx) uint8 or uint16, north row first
    reference_value: float
    binary_scale: int
    decimal_scale: int

    def to_physical(self, packed: np.ndarray | None = None) -> np.ndarray:
        x = self.packed if packed is None else packed
        return ((self.reference_value + x.astype('float32') * np.float32(2.0 ** self.binary_scale))
                / np.float32(10.0 ** self.decimal_scale)).astype('float32')


def _signed16(b: bytes) -> int:
    """GRIB2 signed integers are sign-and-magnitude, not two's complement."""
    v = struct.unpack('>H', b)[0]
    return -(v & 0x7FFF) if v & 0x8000 else v


def _signed32(b: bytes) -> int:
    v = struct.unpack('>I', b)[0]
    return -(v & 0x7FFFFFFF) if v & 0x80000000 else v


def _sections(msg: bytes):
    if msg[:4] != b'GRIB' or msg[7] != 2:
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


def decode(data: bytes) -> Field:
    """Decode one MRMS file (gzipped or not)."""
    msg = gzip.decompress(data) if data[:2] == b'\x1f\x8b' else data
    discipline = msg[6]
    found = {}
    for number, sec in _sections(msg):
        if number in found and number in (3, 5, 7):
            raise UnsupportedGrib('more than one field in the file')
        found[number] = sec

    for needed in (1, 3, 4, 5, 6, 7):
        if needed not in found:
            raise UnsupportedGrib(f'missing section {needed}')
    s1, s3, s4, s5, s6, s7 = (found[n] for n in (1, 3, 4, 5, 6, 7))

    year = struct.unpack('>H', s1[12:14])[0]
    reference_time = dt.datetime(year, s1[14], s1[15], s1[16], s1[17], s1[18], tzinfo=dt.timezone.utc)

    if struct.unpack('>H', s3[12:14])[0] != 0:
        raise UnsupportedGrib('only regular lat/lon grids (template 3.0) are supported')
    nx, ny = struct.unpack('>II', s3[30:38])
    lat1, lon1 = _signed32(s3[46:50]) / 1e6, struct.unpack('>I', s3[50:54])[0] / 1e6
    dlon, dlat = struct.unpack('>II', s3[63:71])
    scan = s3[71]
    if scan != 0:
        raise UnsupportedGrib(f'unexpected scanning mode {scan:#04x}')
    if lon1 > 180:
        lon1 -= 360

    category, parameter = s4[9], s4[10]

    if struct.unpack('>H', s5[9:11])[0] != 41:
        raise UnsupportedGrib('only PNG packing (template 5.41) is supported')
    npoints = struct.unpack('>I', s5[5:9])[0]
    reference_value = struct.unpack('>f', s5[11:15])[0]
    binary_scale, decimal_scale = _signed16(s5[15:17]), _signed16(s5[17:19])
    if s6[5] != 255:
        raise UnsupportedGrib('bitmaps are not supported')

    image = Image.open(io.BytesIO(s7[5:]))
    if image.format != 'PNG' or image.size != (nx, ny):
        raise UnsupportedGrib('section 7 is not a PNG of the grid size')
    packed = np.asarray(image)
    if packed.shape != (ny, nx) or packed.size != npoints:
        raise UnsupportedGrib('unexpected packed data shape')
    if packed.dtype not in (np.uint8, np.uint16):
        raise UnsupportedGrib(f'unexpected PNG sample type {packed.dtype}')

    return Field(
        reference_time=reference_time, discipline=discipline, category=category, parameter=parameter,
        grid=LatLonGrid(nx, ny, lat1, lon1, dlat / 1e6, dlon / 1e6),
        packed=packed, reference_value=reference_value, binary_scale=binary_scale, decimal_scale=decimal_scale,
    )
