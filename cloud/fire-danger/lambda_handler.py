"""
lambda_handler.py
Entry point for the fire danger builder Lambda (EventBridge schedule, see
infra/aws/lib/fire-danger-stack.mjs). One run pulls every source and
publishes what changed; see builder.py.
"""

from __future__ import annotations

import datetime as dt
import os
import time

from builder import FireDangerBuilder
from metrics import log
from store import S3Store


def build(store=None, source=None, clock=time.time):
    builder = FireDangerBuilder(
        store or S3Store(os.environ['FRAMES_BUCKET']),
        source=source,
        clock=clock,
        log=lambda sev, msg, **f: log(sev, msg, **f),
    )
    return builder.run()


def observed_age_days(fems_status: dict, now: float):
    latest = fems_status.get('latestObservedDate')
    if not latest:
        return None
    today = dt.datetime.fromtimestamp(now, dt.timezone.utc).date()
    return (today - dt.date.fromisoformat(latest)).days


def handler(event, context):
    started = time.monotonic()
    try:
        summary = build()
    except Exception as exc:  # a store failure or a bug
        log('ERROR', 'fire_danger_failed', {'fire_danger_build_errors': 1}, error=type(exc).__name__, detail=str(exc)[:300])
        raise
    fems_status = summary['sources']['fems']
    log('INFO', 'fire_danger_run', {
        'fire_danger_build_seconds': round(time.monotonic() - started, 1),
        'fire_danger_objects_written': summary['objectsWritten'],
        'fire_danger_bytes_written': summary['bytesWritten'],
        'fire_danger_source_errors': sum(1 for s in summary['sources'].values() if s.get('status') == 'error'),
        'fire_danger_stations_with_data': fems_status.get('stationsWithCurrentData'),
        'fire_danger_observed_age_days': observed_age_days(fems_status, time.time()),
        'fire_danger_build_errors': 0,
    }, sources={k: v.get('status') for k, v in summary['sources'].items()})
    return {k: v for k, v in summary.items() if k != 'manifest'}
