"""
glm.py
Reads lightning flashes from one GOES GLM Level 2 file (GLM-L2-LCFA, the
"Lightning Cluster-Filter Algorithm" product): NetCDF-4, so HDF5, read with
h5py. One file covers 20 seconds of one satellite's whole view.

GLM reports events (single pixel flashes of light), groups (events in one
2 ms frame) and flashes (groups close in space and time: what a person calls
one lightning flash). Only flashes are kept, with their position, the time of
their first light and their energy, and only those with quality flag 0.

The packed variables follow the CF conventions NOAA uses: int16 storage
read as unsigned when `_Unsigned` is "true", then scale_factor/add_offset.
h5py doesn't apply those, so _unpacked does.
"""

from __future__ import annotations

import datetime as dt
import io
import re

import h5py
import numpy as np

_SINCE = re.compile(r'seconds since (\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)')


class GlmError(ValueError):
    pass


def _attr(obj, name, default=None):
    value = obj.attrs.get(name, default)
    if isinstance(value, np.ndarray) and value.size == 1:
        value = value.reshape(-1)[0]
    if isinstance(value, (bytes, np.bytes_)):
        value = value.decode('utf-8', 'replace')
    return value


def _unpacked(ds) -> np.ndarray:
    raw = ds[()]
    if _attr(ds, '_Unsigned') == 'true' and np.issubdtype(raw.dtype, np.signedinteger):
        raw = raw.view(raw.dtype.str.replace('i', 'u'))
    scale = _attr(ds, 'scale_factor')
    offset = _attr(ds, 'add_offset')
    out = raw.astype(np.float64)
    if scale is not None:
        out = out * float(scale)
    if offset is not None:
        out = out + float(offset)
    return out


def _epoch(units: str) -> float:
    m = _SINCE.search(units or '')
    if not m:
        raise GlmError(f'unexpected time units {units!r}')
    when = dt.datetime.fromisoformat(f'{m.group(1)}T{m.group(2)}').replace(tzinfo=dt.timezone.utc)
    return when.timestamp()


def read_flashes(data: bytes) -> dict:
    """
    One GLM-L2-LCFA file → its good-quality flashes.

    Returns {'platform': 'G19', 'subLon': -75.2, 'start': epoch s, 'end': epoch s,
             'lat': float64[n], 'lon': float64[n], 't': float64[n] (epoch s of first light),
             'energy': float64[n] (J)}.
    """
    try:
        f = h5py.File(io.BytesIO(data), 'r')
    except OSError as exc:
        raise GlmError(f'not an HDF5 file: {exc}') from exc
    with f:
        try:
            lat = f['flash_lat'][()].astype(np.float64)
            lon = f['flash_lon'][()].astype(np.float64)
            offsets = f['flash_time_offset_of_first_event']
            t = _epoch(_attr(offsets, 'units')) + _unpacked(offsets)
            energy = _unpacked(f['flash_energy'])
            quality = f['flash_quality_flag'][()]
            sub_lon = float(f['nominal_satellite_subpoint_lon'][()])
            start = _attr(f, 'time_coverage_start')
            end = _attr(f, 'time_coverage_end')
            platform = _attr(f, 'platform_ID')
        except KeyError as exc:
            raise GlmError(f'missing variable {exc}') from exc

    if not (len(lat) == len(lon) == len(t) == len(energy) == len(quality)):
        raise GlmError('flash arrays differ in length')
    good = (quality == 0) & np.isfinite(lat) & np.isfinite(lon) & (np.abs(lat) <= 90) & (np.abs(lon) <= 180)
    return {
        'platform': platform,
        'subLon': sub_lon,
        'start': _iso_epoch(start),
        'end': _iso_epoch(end),
        'lat': lat[good],
        'lon': lon[good],
        't': t[good],
        'energy': energy[good],
    }


def _iso_epoch(s) -> float | None:
    if not s:
        return None
    try:
        return dt.datetime.fromisoformat(str(s).replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None  # a malformed coverage time shouldn't sink the whole file
