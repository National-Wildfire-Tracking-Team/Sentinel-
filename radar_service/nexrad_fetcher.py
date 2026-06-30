"""
nexrad_fetcher.py
Polls the public NOAA NEXRAD Level II S3 bucket for new volume scans.

Source: https://registry.opendata.aws/noaa-nexrad/
Bucket: noaa-nexrad-level2 (us-east-1, public, no auth required)
Key format: YYYY/MM/DD/KXXX/KXXX_YYYYMMDD_HHMMSS_V06
"""

import asyncio
import io
import logging
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import boto3
from botocore import UNSIGNED
from botocore.config import Config

from stations import NEXRAD_STATIONS, STATION_MAP

log = logging.getLogger(__name__)

# NOAA NEXRAD Level II public bucket — no credentials needed
_S3_BUCKET = "noaa-nexrad-level2"
_S3_CLIENT = boto3.client(
    "s3",
    region_name="us-east-1",
    config=Config(signature_version=UNSIGNED),
)

# Regex matching valid V06 scan files (exclude MDM, no suffix noise)
_FILE_RE = re.compile(r"^(K[A-Z]{3}|P[A-Z]{3}|T[A-Z]{3})(\d{8}_\d{6})_V06$")

POLL_INTERVAL_SECONDS = 150  # 2.5 minutes


class StationStatus:
    def __init__(self, site_id: str):
        self.site_id = site_id
        self.latest_key: Optional[str] = None
        self.latest_scan_time: Optional[datetime] = None
        self.last_checked: Optional[datetime] = None
        self.error: Optional[str] = None

    def to_dict(self) -> dict:
        info = STATION_MAP.get(self.site_id, ("Unknown", "??", 0.0, 0.0))
        return {
            "siteId": self.site_id,
            "name": info[0],
            "state": info[1],
            "lat": info[2],
            "lon": info[3],
            "latestKey": self.latest_key,
            "scanTime": self.latest_scan_time.isoformat() if self.latest_scan_time else None,
            "lastChecked": self.last_checked.isoformat() if self.last_checked else None,
            "error": self.error,
        }


class NEXRADFetcher:
    """
    Background fetcher: tracks the latest scan for each station and
    downloads files on demand. Runs a polling loop every POLL_INTERVAL_SECONDS.
    """

    def __init__(self):
        self._status: dict[str, StationStatus] = {
            sid: StationStatus(sid) for sid, *_ in NEXRAD_STATIONS
        }
        # In-memory download cache: key → raw bytes
        self._file_cache: dict[str, bytes] = {}
        self._cache_max = 30   # keep at most this many files in RAM

    # ── Public API ────────────────────────────────────────────────────────────

    def get_station_status(self) -> list[dict]:
        return [s.to_dict() for s in self._status.values()]

    def get_latest_scan_time(self) -> Optional[datetime]:
        times = [s.latest_scan_time for s in self._status.values() if s.latest_scan_time]
        return max(times) if times else None

    async def get_latest_file(self, site_id: str) -> Optional[bytes]:
        """Return the raw bytes of the latest Level II file for site_id."""
        status = self._status.get(site_id)
        if not status or not status.latest_key:
            return None

        if status.latest_key in self._file_cache:
            return self._file_cache[status.latest_key]

        return await self._download_key(status.latest_key, site_id)

    # ── Polling loop ──────────────────────────────────────────────────────────

    async def run_polling_loop(self):
        log.info("NEXRADFetcher polling loop started (interval=%ds)", POLL_INTERVAL_SECONDS)
        while True:
            await self._poll_all_stations()
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def _poll_all_stations(self):
        now_utc = datetime.now(timezone.utc)
        # Build list of prefixes to check (today + yesterday for UTC boundary)
        date_prefixes = _build_date_prefixes(now_utc)

        tasks = [
            self._poll_station(sid, date_prefixes)
            for sid, *_ in NEXRAD_STATIONS
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        new_count = sum(1 for r in results if r is True)
        if new_count:
            log.info("Found %d new scans", new_count)

    async def _poll_station(self, site_id: str, date_prefixes: list[str]) -> bool:
        """Check for new files for one station. Returns True if a new scan was found."""
        status = self._status[site_id]
        status.last_checked = datetime.now(timezone.utc)
        status.error = None

        try:
            latest_key, scan_time = await asyncio.to_thread(
                _find_latest_key, site_id, date_prefixes
            )
        except Exception as exc:
            status.error = str(exc)
            log.debug("Error polling %s: %s", site_id, exc)
            return False

        if latest_key and latest_key != status.latest_key:
            log.info("New scan for %s: %s", site_id, latest_key)
            status.latest_key = latest_key
            status.latest_scan_time = scan_time
            # Evict old cache entry if key changed
            old_keys = [k for k in self._file_cache if k.startswith(f"{site_id}/")]
            for k in old_keys:
                del self._file_cache[k]
            return True

        return False

    async def _download_key(self, key: str, site_id: str) -> Optional[bytes]:
        try:
            data = await asyncio.to_thread(_s3_get_object, key)
            # Evict oldest entry if cache full
            if len(self._file_cache) >= self._cache_max:
                oldest = next(iter(self._file_cache))
                del self._file_cache[oldest]
            self._file_cache[key] = data
            log.info("Downloaded %s (%d bytes)", key, len(data))
            return data
        except Exception as exc:
            log.warning("Failed to download %s: %s", key, exc)
            return None


# ── S3 helpers (run in thread pool) ──────────────────────────────────────────

def _build_date_prefixes(now: datetime) -> list[str]:
    """Return [today_prefix, yesterday_prefix] to catch UTC-day boundary."""
    from datetime import timedelta
    yesterday = now - timedelta(days=1)
    return [
        f"{now.year}/{now.month:02d}/{now.day:02d}/",
        f"{yesterday.year}/{yesterday.month:02d}/{yesterday.day:02d}/",
    ]


def _find_latest_key(site_id: str, date_prefixes: list[str]) -> tuple[Optional[str], Optional[datetime]]:
    """List S3 objects for site_id and return the key of the most-recent V06 scan."""
    best_key = None
    best_time = None

    for date_pfx in date_prefixes:
        prefix = f"{date_pfx}{site_id}/"
        try:
            paginator = _S3_CLIENT.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=_S3_BUCKET, Prefix=prefix, PaginationConfig={"MaxItems": 500})
            for page in pages:
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    fname = key.split("/")[-1]
                    m = _FILE_RE.match(fname)
                    if not m:
                        continue
                    ts_str = m.group(2)  # YYYYMMDD_HHMMSS
                    try:
                        scan_dt = datetime.strptime(ts_str, "%Y%m%d_%H%M%S").replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue
                    if best_time is None or scan_dt > best_time:
                        best_time = scan_dt
                        best_key = key
        except Exception:
            pass  # pagination error — try next date prefix

    return best_key, best_time


def _s3_get_object(key: str) -> bytes:
    obj = _S3_CLIENT.get_object(Bucket=_S3_BUCKET, Key=key)
    return obj["Body"].read()
