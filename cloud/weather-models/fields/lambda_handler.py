"""
fields/lambda_handler.py
Entry point for the field-builder Lambda (EventBridge, every 15 minutes).
Builds nothing unless a model has a new complete run; see builder.py.
"""

from __future__ import annotations

import os
import time

from fields.builder import FieldBuilder
from fields.store import S3Store
from metrics import log
from providers import PROVIDER_CLASSES, ProviderError


def build(store=None, providers=None):
    providers = providers or {m: cls(chunk_cache_bytes=0) for m, cls in PROVIDER_CLASSES.items()}
    store = store or S3Store(os.environ['FIELDS_BUCKET'])
    builder = FieldBuilder(providers, store, workers=int(os.environ.get('FIELD_BUILDER_WORKERS', '4')),
                           log=lambda sev, msg, **f: log(sev, msg, **f))
    return builder.run()


def handler(event, context):
    started = time.monotonic()
    try:
        summary = build()
    except ProviderError as exc:
        log('ERROR', 'fields_failed', {'field_build_errors': 1}, error=exc.code, detail=str(exc)[:300])
        raise
    except Exception as exc:
        log('ERROR', 'fields_failed', {'field_build_errors': 1}, error=type(exc).__name__, detail=str(exc)[:300])
        raise
    log('INFO', 'fields_run', {
        'field_build_seconds': round(time.monotonic() - started, 1),
        'field_frames_written': summary['framesWritten'],
        'field_bytes_written': summary['bytesWritten'],
        'field_build_errors': 0,
    }, built=summary['built'], hrrr=summary['hrrr'], gfs=summary['gfs'])
    return summary
