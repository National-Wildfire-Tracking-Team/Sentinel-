"""
metrics.py
Structured logs and CloudWatch metrics in one line.

Each request writes one JSON log line, the same shape the other Sentinel
services use (severity, message, component, ...). The line is also in
CloudWatch Embedded Metric Format, so CloudWatch turns its counters into
metrics in the Sentinel/WeatherModels namespace with no PutMetricData calls,
no extra IAM and no extra latency. Lambda already ships stdout to the
function's log group.

Never logged: the requested location, client IPs, or forecast values.
"""

from __future__ import annotations

import json
import os
import sys
import time

NAMESPACE = 'Sentinel/WeatherModels'
COMPONENT = 'weather-models'
REVISION = os.environ.get('AWS_LAMBDA_FUNCTION_VERSION', 'local')

# The metrics the request log line can carry, and their CloudWatch units.
METRIC_UNITS = {
    'weather_requests': 'Count',
    'hrrr_requests': 'Count',
    'gfs_requests': 'Count',
    'cache_hits': 'Count',
    'cache_misses': 'Count',
    'model_data_latency': 'Milliseconds',
    'dataset_errors': 'Count',
    'stale_data_events': 'Count',
    # field builder (fields/lambda_handler.py)
    'field_build_seconds': 'Seconds',
    'field_frames_written': 'Count',
    'field_bytes_written': 'Bytes',
    'field_build_errors': 'Count',
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
