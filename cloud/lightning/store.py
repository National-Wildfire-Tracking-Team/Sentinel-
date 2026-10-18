"""
store.py
Where the flashes file is written: S3 in production, a local directory for
development and tests. Both take the same object keys.

latest.json is the only object. It's stored gzipped (Content-Encoding: gzip;
CloudFront passes that through to browsers) with a lifetime under the
builder's 1-minute cadence. It's also the builder's state: each run reads it
back to know which files it has already read.
"""

from __future__ import annotations

import gzip
import json
import os

LATEST_CACHE = 'public, max-age=30, must-revalidate'


def _json(body: bytes):
    if body[:2] == b'\x1f\x8b':
        body = gzip.decompress(body)
    return json.loads(body)


class LocalStore:
    def __init__(self, root: str):
        self.root = root

    def put(self, key: str, body: bytes, content_type: str, cache_control: str, content_encoding: str | None = None) -> None:
        path = os.path.join(self.root, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as fh:
            fh.write(body)

    def get_json(self, key: str):
        try:
            with open(os.path.join(self.root, key), 'rb') as fh:
                return _json(fh.read())
        except FileNotFoundError:
            return None


class S3Store:
    """Writes to Sentinel's own bucket. Credentials come from the Lambda role (no keys anywhere).

    Only this private output bucket uses the role; NOAA's GOES buckets are read anonymously (source.py).
    """

    def __init__(self, bucket: str, client=None):
        import boto3  # provided by the Lambda Python runtime

        self.bucket = bucket
        self.client = client or boto3.client('s3')

    def put(self, key: str, body: bytes, content_type: str, cache_control: str, content_encoding: str | None = None) -> None:
        extra = {'ContentEncoding': content_encoding} if content_encoding else {}
        self.client.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType=content_type, CacheControl=cache_control, **extra)

    def get_json(self, key: str):
        from botocore.exceptions import ClientError

        try:
            obj = self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            if exc.response.get('Error', {}).get('Code') in ('NoSuchKey', '404'):
                return None  # first run: nothing written yet
            raise
        return _json(obj['Body'].read())
