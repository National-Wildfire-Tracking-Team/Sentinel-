"""
cache.py
In-process caching for the weather-model service. Three layers, cheapest first:

1. CloudFront (outside this process) caches whole responses by query string
   for the s-maxage app.py sets. Edge hits never reach Lambda.
2. PointCache (here): one entry per (model, run, grid cell, dataset variable)
   holding that variable's lead-time series — a few hundred floats. Any
   request for the same cell and run reuses it, whatever variable mix or
   units it asks for. A complete run never changes, so its entries live for
   hours; a run still being ingested is re-read after a minute.
3. Icechunk's chunk cache (configured in providers/base.py): the compressed
   chunks behind those series. One HRRR chunk covers ~265×300 cells
   (~800×900 km), so a second location in the same region costs no S3 read.

Nothing is persisted: Lambda memory is free, and cold-start refills are a
handful of S3 range requests. See README.md "Caching" for when to add a
shared tier.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict


class TTLCache:
    """A thread-safe LRU with a per-entry TTL."""

    def __init__(self, max_entries: int = 20000, clock=time.monotonic):
        self._max = max_entries
        self._clock = clock
        self._data: OrderedDict = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key):
        with self._lock:
            item = self._data.get(key)
            if item is None:
                self.misses += 1
                return None
            expires, value = item
            if self._clock() >= expires:
                del self._data[key]
                self.misses += 1
                return None
            self._data.move_to_end(key)
            self.hits += 1
            return value

    def set(self, key, value, ttl_s: float) -> None:
        with self._lock:
            self._data[key] = (self._clock() + ttl_s, value)
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)


class PointCache:
    """Lead-time series per (model, run, grid cell, dataset variable)."""

    COMPLETE_RUN_TTL_S = 6 * 3600
    PARTIAL_RUN_TTL_S = 60

    def __init__(self, max_entries: int = 20000, clock=time.monotonic):
        self._cache = TTLCache(max_entries, clock)

    @staticmethod
    def key(model_id: str, run_time: int, iy: int, ix: int, var: str):
        return (model_id, run_time, iy, ix, var)

    def get_many(self, model_id, run_time, point, variables):
        """Returns (found: dict var -> series, missing: list of vars)."""
        found, missing = {}, []
        for var in variables:
            series = self._cache.get(self.key(model_id, run_time, point.iy, point.ix, var))
            if series is None:
                missing.append(var)
            else:
                found[var] = series
        return found, missing

    def set_many(self, model_id, run_time, point, values: dict, complete: bool) -> None:
        ttl = self.COMPLETE_RUN_TTL_S if complete else self.PARTIAL_RUN_TTL_S
        for var, series in values.items():
            self._cache.set(self.key(model_id, run_time, point.iy, point.ix, var), series, ttl)

    @property
    def stats(self) -> dict:
        return {'entries': len(self._cache), 'hits': self._cache.hits, 'misses': self._cache.misses}


class RateLimiter:
    """Fixed-window per-client limiter, same shape as nws-alerts' RateLimiter.

    Only uncached requests reach Lambda, so this bounds what one client can
    cost in S3 reads and compute; CloudFront serves repeats for free.
    """

    def __init__(self, limit: int, window_s: float = 60, clock=time.monotonic):
        self._limit = limit
        self._window_s = window_s
        self._clock = clock
        self._hits: dict[str, tuple[float, int]] = {}
        self._lock = threading.Lock()

    def allow(self, client: str) -> bool:
        if self._limit <= 0:
            return True
        now = self._clock()
        with self._lock:
            start, count = self._hits.get(client, (now, 0))
            if now - start >= self._window_s:
                start, count = now, 0
            if count >= self._limit:
                return False
            self._hits[client] = (start, count + 1)
            if len(self._hits) > 10000:
                self._hits = {k: v for k, v in self._hits.items() if now - v[0] < self._window_s}
            return True
