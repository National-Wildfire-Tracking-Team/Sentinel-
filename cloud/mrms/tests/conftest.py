"""Shared fixtures: the service directory on sys.path, and synthetic MRMS GRIB2 files.

`make_grib` writes the same shape MRMS does (template 3.0 lat/lon grid,
5.41 PNG packing, no bitmap, gzipped), so tests run offline.
"""

import datetime as dt
import gzip
import io
import os
import struct
import sys

import numpy as np
import pytest
from PIL import Image

SERVICE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, SERVICE_DIR)


def _section(number: int, body: bytes) -> bytes:
    return struct.pack('>IB', 5 + len(body), number) + body


def _sm16(v: int) -> bytes:
    return struct.pack('>H', (0x8000 | -v) if v < 0 else v)


def make_grib(packed: np.ndarray, *, when=dt.datetime(2026, 10, 2, 0, 46, 38), lat1=54.995, lon1=230.005,
              step=0.01, R=-9990.0, E=0, D=1, template5=41, scan=0, category=10, parameter=0, gz=True) -> bytes:
    ny, nx = packed.shape
    s1 = _section(1, struct.pack('>HHBBB', 161, 0, 2, 1, 0) + struct.pack('>HBBBBB', when.year, when.month, when.day,
                                                                       when.hour, when.minute, when.second) + bytes([0, 0]))
    s3 = bytearray(72 - 5)
    s3[1:5] = struct.pack('>I', nx * ny)
    s3[7:9] = struct.pack('>H', 0)
    s3[25:33] = struct.pack('>II', nx, ny)
    s3[41:49] = struct.pack('>iI', round(lat1 * 1e6), round(lon1 * 1e6))
    s3[58:66] = struct.pack('>II', round(step * 1e6), round(step * 1e6))
    s3[66] = scan
    s4 = bytearray(34 - 5)
    s4[4], s4[5] = category, parameter
    bits = 16 if packed.dtype == np.uint16 else 8
    s5 = struct.pack('>IH', nx * ny, template5) + struct.pack('>f', R) + _sm16(E) + _sm16(D) + bytes([bits, 0])
    buf = io.BytesIO()
    Image.fromarray(packed).save(buf, format='PNG')
    body = s1 + _section(3, bytes(s3)) + _section(4, bytes(s4)) + _section(5, s5) + _section(6, bytes([255])) \
        + _section(7, buf.getvalue()) + b'7777'
    msg = b'GRIB' + bytes([0, 0, 209, 2]) + struct.pack('>Q', 16 + len(body)) + body
    return gzip.compress(msg) if gz else msg


@pytest.fixture
def grib():
    return make_grib
