"""
metrics.py
Structured logs and CloudWatch metrics in one line.

Each builder run writes one JSON log line, the same shape the other Sentinel
services use (severity, message, component, ...). The line is also in
CloudWatch Embedded Metric Format, so CloudWatch turns its counters into
metrics in the Sentinel/FireDanger namespace with no PutMetricData calls,
no extra IAM and no extra latency. Lambda already ships stdout to the
function's log group.

Never logged: data values. There are no client requests (the CDN serves every view).
"""

from __future__ import annotations

import json
import os
import sys
import time

NAMESPACE = 'Sentinel/FireDanger'
COMPONENT = 'fire-danger'
REVISION = os.environ.get('AWS_LAMBDA_FUNCTION_VERSION', 'local')

# The metrics the run log line can carry, and their CloudWatch units.
METRIC_UNITS = {
    'fire_danger_build_seconds': 'Seconds',
    'fire_danger_objects_written': 'Count',
    'fire_danger_bytes_written': 'Bytes',
    'fire_danger_source_errors': 'Count',
    'fire_danger_build_errors': 'Count',
    'fire_danger_stations_with_data': 'Count',
    'fire_danger_observed_age_days': 'Count',
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
