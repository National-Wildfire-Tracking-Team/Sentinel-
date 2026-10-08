"""
metrics.py
Structured logs and CloudWatch metrics in one line (the cloud/mrms/metrics.py
shape, with this service's names).

Every line is one JSON object: severity, message, component, plus fields.
Lines that carry metrics are also in CloudWatch Embedded Metric Format, so
CloudWatch turns them into metrics in the Sentinel/HAFS namespace with no
PutMetricData calls, no extra IAM and no extra latency.

Never logged: data values or request headers.
"""

from __future__ import annotations

import json
import os
import sys
import time

NAMESPACE = 'Sentinel/HAFS'
COMPONENT = 'hafs'
REVISION = os.environ.get('AWS_LAMBDA_FUNCTION_VERSION', 'local')

METRIC_UNITS = {
    'hafs_request_ms': 'Milliseconds',
    'hafs_frame_ms': 'Milliseconds',
    'hafs_png_bytes': 'Bytes',
    'hafs_server_errors': 'Count',
    'hafs_upstream_errors': 'Count',
}


def log(severity: str, message: str, metrics: dict | None = None, out=None, **fields) -> dict:
    record = {'severity': severity, 'message': message, 'component': COMPONENT, 'revision': REVISION, **fields}
    metrics = {k: v for k, v in (metrics or {}).items() if k in METRIC_UNITS and v is not None}
    if metrics:
        record.update(metrics)
        record['Service'] = COMPONENT
        record['_aws'] = {
            'Timestamp': int(time.time() * 1000),
            'CloudWatchMetrics': [{
                'Namespace': NAMESPACE,
                'Dimensions': [['Service']],
                'Metrics': [{'Name': k, 'Unit': METRIC_UNITS[k]} for k in metrics],
            }],
        }
    print(json.dumps(record, separators=(',', ':'), default=str), file=out or sys.stdout, flush=True)
    return record
