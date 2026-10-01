"""
providers/base.py
The contract every numerical weather model implements, plus the shared
machinery for reading a dynamical.org Icechunk/Zarr dataset on AWS Open Data.

A provider knows only three things about its model:
  - where the dataset lives (bucket, prefix, region),
  - its grid (lat/lon -> array index and back, and how its winds are oriented),
  - which dataset variables back each normalized Sentinel variable.

Run selection, units, caching and HTTP live outside the provider (service.py,
normalize.py, cache.py, app.py), so adding a model is one small subclass.

Reads are lazy: opening a dataset fetches only repository metadata, and a
point read fetches the one compressed chunk that contains that point for each
requested variable (2-4 MB). Nothing ever downloads a whole field, let alone
the dataset.
"""

from __future__ import annotations

import math
import threading
import time
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import numpy as np

# One shared pool: a request reads its variables in parallel (each read is an
# independent S3 range request), but a Lambda instance serves one request at a
# time, so a small pool is plenty.
_READ_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix='zarr-read')


class ProviderError(Exception):
    """Base for errors the HTTP layer maps to a status code."""

    code = 'provider_error'


class OutOfDomainError(ProviderError):
    """The point is outside the model's grid (e.g. HRRR outside CONUS)."""

    code = 'out_of_domain'


class DatasetError(ProviderError):
    """The dataset couldn't be opened or read (S3, network, schema change)."""

    code = 'dataset_error'


class NoDataError(ProviderError):
    """The dataset opened, but no recent run has data at this point."""

    code = 'no_data'


@dataclass(frozen=True)
class GridPoint:
    """The grid cell nearest a requested point, and that cell's centre."""

    iy: int
    ix: int
    lat: float
    lon: float


@dataclass(frozen=True)
class RunIndex:
    """The dataset's time axes as of one Icechunk snapshot."""

    snapshot_id: str
    init_times: np.ndarray  # int64 seconds since the epoch, ascending
    lead_seconds: np.ndarray  # float64 seconds after init, ascending
    expected_seconds: np.ndarray  # float64 per init: the run's planned length (NaN if unknown)

    def expected_lead_count(self, run_pos: int) -> int:
        """How many lead times this run is planned to have."""
        expected = self.expected_seconds[run_pos]
        if not np.isfinite(expected):
            return len(self.lead_seconds)
        return int(np.searchsorted(self.lead_seconds, expected, side='right'))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class WeatherModelProvider(ABC):
    """One numerical weather model backed by a dynamical.org Icechunk dataset."""

    # ── Identity (shown to users; never reuse one model's labels for another) ──
    id: str  # 'hrrr'
    name: str  # 'HRRR'
    full_name: str
    operator = 'NOAA NWS NCEP'
    resolution: str
    domain: str

    # ── Dataset location ──
    bucket: str
    prefix: str
    region = 'us-west-2'
    dataset_id: str
    dataset_version: str
    attribution: str
    license = 'CC-BY-4.0'

    # ── Forecast semantics ──
    max_forecast_hours: int
    default_forecast_hours: int
    run_interval_hours = 6
    stale_after_hours: float  # older than this: served, but flagged stale
    max_age_hours: float  # older than this: refused rather than presented as a forecast

    # Normalized Sentinel variable -> dataset variables it is computed from.
    # A variable absent here is not provided by this model and is never faked.
    SOURCES: dict[str, tuple[str, ...]]

    # Read for every request: an instantaneous field every run writes at
    # every lead time, so its trailing NaNs show how far ingest has got.
    COMPLETENESS_VAR = 'temperature_2m'

    def __init__(self, storage=None, *, session_ttl_s: float = 60, chunk_cache_bytes: int = 256 * 1024 * 1024,
                 clock=time.time):
        self._storage = storage
        self._session_ttl_s = session_ttl_s
        self._chunk_cache_bytes = chunk_cache_bytes
        self._clock = clock
        self._lock = threading.Lock()
        self._repo = None
        self._group = None
        self._arrays: dict = {}
        self._snapshot_id: str | None = None
        self._opened_at = -math.inf
        self._run_index: RunIndex | None = None

    # ── Grid (model-specific) ──

    @abstractmethod
    def locate(self, lat: float, lon: float) -> GridPoint:
        """Nearest grid cell to (lat, lon). Raises OutOfDomainError."""

    def contains(self, lat: float, lon: float) -> bool:
        try:
            self.locate(lat, lon)
            return True
        except OutOfDomainError:
            return False

    def earth_relative_wind(self, u: np.ndarray, v: np.ndarray, point: GridPoint) -> tuple[np.ndarray, np.ndarray]:
        """Rotate the dataset's u/v to eastward/northward. Identity for lat/lon grids."""
        return u, v

    def domain_geojson(self) -> dict | None:
        """The model's coverage as a GeoJSON geometry, or None for global models."""
        return None

    def validate_grid(self, group) -> None:
        """Called once per open: raise DatasetError if the grid isn't the one locate() assumes."""

    # ── Dataset access ──

    def _make_storage(self):
        import icechunk

        return icechunk.s3_storage(bucket=self.bucket, prefix=self.prefix, region=self.region, anonymous=True)

    def _open(self):
        """Open (or refresh) a read-only session on the dataset's main branch.

        The repository object — and with it Icechunk's in-memory chunk cache —
        lives for the whole Lambda instance. Only the session is refreshed,
        every session_ttl_s, which is how a newly ingested run becomes visible.
        """
        import icechunk
        import zarr

        now = self._clock()
        with self._lock:
            if self._group is not None and now - self._opened_at < self._session_ttl_s:
                return self._group
            try:
                if self._repo is None:
                    storage = self._storage if self._storage is not None else self._make_storage()
                    config = icechunk.RepositoryConfig(
                        caching=icechunk.CachingConfig(num_bytes_chunks=self._chunk_cache_bytes),
                    )
                    self._repo = icechunk.Repository.open(storage, config=config)
                session = self._repo.readonly_session('main')
                group = zarr.open_group(session.store, mode='r')
                snapshot_id = str(session.snapshot_id)
            except Exception as exc:  # icechunk/zarr/S3 errors have no common base
                raise DatasetError(f'{self.name} dataset could not be opened: {type(exc).__name__}') from exc
            if snapshot_id != self._snapshot_id:
                self.validate_grid(group)
                self._arrays = {}
                self._run_index = None
                self._snapshot_id = snapshot_id
            self._group = group
            self._opened_at = now
            return group

    def _array(self, name: str):
        group = self._open()
        arr = self._arrays.get(name)
        if arr is None:
            try:
                arr = group[name]
            except KeyError as exc:
                raise DatasetError(f'{self.name} dataset has no variable {name!r}') from exc
            self._arrays[name] = arr
        return arr

    @property
    def snapshot_id(self) -> str | None:
        return self._snapshot_id

    def run_index(self) -> RunIndex:
        """The dataset's init and lead times. Read once per snapshot (~100 KB)."""
        self._open()
        if self._run_index is not None:
            return self._run_index
        try:
            init_times = np.asarray(self._array('init_time')[:], dtype='int64')
            lead_seconds = np.asarray(self._array('lead_time')[:], dtype='float64')
            expected = np.asarray(self._array('expected_forecast_length')[:], dtype='float64')
        except ProviderError:
            raise
        except Exception as exc:
            raise DatasetError(f'{self.name} time axes could not be read: {type(exc).__name__}') from exc
        if init_times.size == 0:
            raise NoDataError(f'{self.name} dataset has no model runs')
        self._run_index = RunIndex(self._snapshot_id, init_times, lead_seconds, expected)
        return self._run_index

    def read_point(self, run_pos: int, point: GridPoint, dataset_vars: list[str]) -> dict[str, np.ndarray]:
        """Every lead time of one run at one grid cell, for each dataset variable."""

        def read(name):
            try:
                return name, np.asarray(self._array(name)[run_pos, :, point.iy, point.ix], dtype='float64')
            except ProviderError:
                raise
            except Exception as exc:
                raise DatasetError(f'{self.name} {name} could not be read: {type(exc).__name__}') from exc

        return dict(_READ_POOL.map(read, dataset_vars))

    def read_field(self, run_pos: int, name: str, rows: slice = slice(None), cols: slice = slice(None)) -> np.ndarray:
        """Every lead time of one run over a region: (lead, y, x) float32.

        Used by the map-field builder. Each chunk holds all lead times, so
        reading the whole run at once costs no more than reading one hour.
        """
        try:
            return np.asarray(self._array(name)[run_pos, :, rows, cols], dtype='float32')
        except ProviderError:
            raise
        except Exception as exc:
            raise DatasetError(f'{self.name} {name} field could not be read: {type(exc).__name__}') from exc

    # ── Metadata ──

    @property
    def variables(self) -> list[str]:
        return list(self.SOURCES)

    def describe(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'fullName': self.full_name,
            'operator': self.operator,
            'resolution': self.resolution,
            'domain': self.domain,
            'maxForecastHours': self.max_forecast_hours,
            'defaultForecastHours': self.default_forecast_hours,
            'runIntervalHours': self.run_interval_hours,
            'staleAfterHours': self.stale_after_hours,
            'variables': self.variables,
            'source': self.source(),
        }

    def source(self) -> dict:
        return {
            'dataset': self.dataset_id,
            'datasetVersion': self.dataset_version,
            'uri': f's3://{self.bucket}/{self.prefix}',
            'region': self.region,
            'format': 'Icechunk (Zarr v3)',
            'processedBy': 'dynamical.org',
            'attribution': self.attribution,
            'license': self.license,
        }
