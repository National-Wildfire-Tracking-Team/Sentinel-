"""
metrics.py
Structured logs and CloudWatch metrics in one line.

Each builder run writes one JSON log line, the same shape the other Sentinel
services use (severity, message, component, ...). The line is also in
CloudWatch Embedded Metric Format, so CloudWatch turns its counters into
metrics in the Sentinel/MRMS namespace with no PutMetricData calls,
no extra IAM and no extra latency. Lambda already ships stdout to the
function's log group.

Never logged: data values. There are no client requests (the CDN serves every view).
"""

from __future__ import annotations

import json
import os
import sys
import time

NAMESPACE = 'Sentinel/MRMS'
COMPONENT = 'mrms'
REVISION = os.environ.get('AWS_LAMBDA_FUNCTION_VERSION', 'local')

# The metrics the run log line can carry, and their CloudWatch units.
METRIC_UNITS = {
    'mrms_build_seconds': 'Seconds',
    'mrms_frames_written': 'Count',
    'mrms_bytes_written': 'Bytes',
    'mrms_source_bytes': 'Bytes',
    'mrms_product_errors': 'Count',
    'mrms_build_errors': 'Count',
    'mrms_latest_age_seconds': 'Seconds',
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
    print(json.dumps(record, separators=(',', ':')), file=out or sys.stdout, flush=True)
    return record
