"""
png.py (a copy of cloud/weather-models/fields/png.py; tests/test_png.py keeps them identical)
A minimal PNG writer for frames (8-bit greyscale or RGBA). Pillow decodes
MRMS's PNG-packed GRIB2 here, but writing stays on this tested encoder.

Every row uses the PNG "Sub" filter (each byte minus its left neighbour).
Model fields are smooth, so most filtered bytes are near zero and zlib
compresses them well. zlib also releases the GIL, so frames encode in
parallel threads.
"""

from __future__ import annotations

import struct
import zlib

import numpy as np

_SIGNATURE = b'\x89PNG\r\n\x1a\n'


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)


def encode_png(pixels: np.ndarray, level: int = 6) -> bytes:
    """pixels: (H, W) uint8 greyscale or (H, W, 4) uint8 RGBA."""
    if pixels.dtype != np.uint8:
        raise ValueError('pixels must be uint8')
    if pixels.ndim == 2:
        color_type, channels = 0, 1
        rows = pixels
    elif pixels.ndim == 3 and pixels.shape[2] == 4:
        color_type, channels = 6, 4
        rows = pixels.reshape(pixels.shape[0], -1)
    else:
        raise ValueError('expected (H, W) or (H, W, 4)')
    height, width = pixels.shape[:2]
    # Sub filter: byte minus the same channel of the pixel to its left (mod 256).
    filtered = rows.astype(np.int16)
    filtered[:, channels:] -= rows[:, :-channels].astype(np.int16)
    filtered = (filtered & 0xFF).astype(np.uint8)
    raw = np.concatenate([np.ones((height, 1), np.uint8), filtered], axis=1)  # filter type 1 per row
    ihdr = struct.pack('>IIBBBBB', width, height, 8, color_type, 0, 0, 0)
    return _SIGNATURE + _chunk(b'IHDR', ihdr) + _chunk(b'IDAT', zlib.compress(raw.tobytes(), level)) + _chunk(b'IEND', b'')
