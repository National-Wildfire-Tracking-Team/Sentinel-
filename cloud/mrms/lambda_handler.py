"""
lambda_handler.py
Entry point for the MRMS builder Lambda (EventBridge, every 2 minutes).
Builds only frames that are new since the last run; see builder.py.
"""

from __future__ import annotations

import os
import time

from builder import MrmsBuilder
from metrics import log
from source import MrmsSource
from store import S3Store


def build(store=None, source=None, clock=time.time):
    builder = MrmsBuilder(
        source or MrmsSource(),
        store or S3Store(os.environ['FRAMES_BUCKET']),
        clock=clock,
        window_minutes=int(os.environ.get('MRMS_WINDOW_MINUTES', '60')),
        max_new_frames=int(os.environ.get('MRMS_MAX_NEW_FRAMES', '4')),
        workers=int(os.environ.get('MRMS_WORKERS', '3')),
        log=lambda sev, msg, **f: log(sev, msg, **f),
    )
    return builder.run()


def handler(event, context):
    started = time.monotonic()
    try:
        summary = build()
    except Exception as exc:  # a store failure or a bug: every product is affected
        log('ERROR', 'mrms_failed', {'mrms_build_errors': 1}, error=type(exc).__name__, detail=str(exc)[:300])
        raise
    log('INFO', 'mrms_run', {
        'mrms_build_seconds': round(time.monotonic() - started, 1),
        'mrms_frames_written': summary['framesWritten'],
        'mrms_bytes_written': summary['bytesWritten'],
        'mrms_source_bytes': summary['sourceBytes'],
        'mrms_product_errors': summary['productErrors'],
        'mrms_latest_age_seconds': summary['latestAgeSeconds'],
        'mrms_build_errors': 0,
    }, products=summary['products'])
    return summary
