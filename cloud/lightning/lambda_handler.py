"""
lambda_handler.py
Entry point for the lightning builder Lambda (EventBridge, every minute).
Reads only GLM files that are new since the last run; see builder.py.
"""

from __future__ import annotations

import os
import time

from builder import LightningBuilder
from metrics import log
from source import GlmSource
from store import S3Store


def build(store=None, source=None, clock=time.time):
    builder = LightningBuilder(
        source or GlmSource(),
        store or S3Store(os.environ['OUTPUT_BUCKET']),
        clock=clock,
        window_seconds=int(os.environ.get('LIGHTNING_WINDOW_SECONDS', '900')),
        max_files_per_satellite=int(os.environ.get('LIGHTNING_MAX_FILES', '30')),
        workers=int(os.environ.get('LIGHTNING_WORKERS', '8')),
        log=lambda sev, msg, **f: log(sev, msg, **f),
    )
    return builder.run()


def handler(event, context):
    started = time.monotonic()
    try:
        summary = build()
    except Exception as exc:  # a store failure or a bug: nothing was written
        log('ERROR', 'lightning_failed', {'lightning_build_errors': 1}, error=type(exc).__name__, detail=str(exc)[:300])
        raise
    log('INFO', 'lightning_run', {
        'lightning_build_seconds': round(time.monotonic() - started, 1),
        'lightning_files_read': summary['filesRead'],
        'lightning_source_bytes': summary['sourceBytes'],
        'lightning_flashes': summary['flashes'],
        'lightning_bytes_written': summary['bytesWritten'],
        'lightning_source_errors': summary['sourceErrors'],
        'lightning_latest_age_seconds': summary['latestAgeSeconds'],
        'lightning_build_errors': 0,
    }, satellites=summary['satellites'])
    return summary
