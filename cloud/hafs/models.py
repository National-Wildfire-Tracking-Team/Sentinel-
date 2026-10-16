"""
models.py
The hurricane models this service knows, and where their gridded output is.

Live models are read from NOAA's public HAFS bucket on AWS Open Data
(s3://noaa-nws-hafs-pds, us-east-1), with NOMADS as the fallback for data
reads. Both were checked on 2026-10-08:

  s3://noaa-nws-hafs-pds/{prefix}/{YYYYMMDD}/{HH}/{storm}.{YYYYMMDDHH}.{prefix}.{domain}.atm.f{hhh}.grb2  (+ .idx)
  https://nomads.ncep.noaa.gov/pub/data/nccf/com/hafs/prod/{prefix}.{YYYYMMDD}/{HH}/…  (same file names)

`storm` is the lower-case storm number and basin letter (09l Atlantic,
18e East Pacific, 01c Central Pacific, 27w West Pacific, …): HAFS runs for
every basin NCEP covers, not only NHC's.

HWRF and HMON are retired (superseded by HAFS in 2023). They are listed as
`legacy` with no source, so they never appear as live runs and nothing is
renamed to stand in for them. Supporting their archived output later means
giving them a `source` here and a reader for their file layout, which differs
from HAFS's.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Domain:
    id: str  # as in the file name
    label: str
    description: str


@dataclass(frozen=True)
class HurricaneModel:
    id: str  # API id
    name: str
    atcf: str  # the model's ATCF technique id (spaghetti tracks use the same)
    status: str  # 'operational' | 'legacy'
    description: str
    prefix: str | None = None  # bucket / NOMADS directory prefix; None = no gridded source configured
    domains: tuple[Domain, ...] = field(default_factory=tuple)
    # NOAA's planned run length. Only used to say whether a run is complete;
    # the hours offered always come from the files that actually exist.
    forecast_hours: int | None = None
    cycle_hours: int | None = None


STORM_NEST = Domain(
    'storm', 'Storm-following nest',
    'High-resolution (0.02°, ~2 km) nest that moves with the storm. Its position changes every forecast hour.')
PARENT = Domain(
    'parent', 'Parent domain',
    'The larger 0.06° (~6 km) outer domain around the basin, fixed for the whole run.')

MODELS: dict[str, HurricaneModel] = {m.id: m for m in [
    HurricaneModel(
        'hfsa', 'HAFS-A', 'HFSA', 'operational',
        'NOAA Hurricane Analysis and Forecast System, configuration A.',
        prefix='hfsa', domains=(STORM_NEST, PARENT), forecast_hours=126, cycle_hours=6),
    HurricaneModel(
        'hfsb', 'HAFS-B', 'HFSB', 'operational',
        'NOAA Hurricane Analysis and Forecast System, configuration B.',
        prefix='hfsb', domains=(STORM_NEST, PARENT), forecast_hours=126, cycle_hours=6),
    HurricaneModel(
        'hwrf', 'HWRF', 'HWRF', 'legacy',
        'Hurricane Weather Research and Forecasting model. Retired; superseded by HAFS in 2023. '
        'No live runs exist, and archived output is not connected yet.'),
    HurricaneModel(
        'hmon', 'HMON', 'HMON', 'legacy',
        'Hurricanes in a Multi-scale Ocean-coupled Non-hydrostatic model. Retired; superseded by HAFS in 2023. '
        'No live runs exist, and archived output is not connected yet.'),
]}

LIVE_MODELS = tuple(m for m in MODELS.values() if m.prefix)
