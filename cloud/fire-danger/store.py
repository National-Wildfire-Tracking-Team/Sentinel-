"""
store.py
Where fire danger outputs and the manifest are written: S3 in production, a
local directory for development and tests. Both take the same object keys
(the same shape as cloud/mrms/store.py).

Run directories never change once written and are cached "immutable". The
manifest is the only mutable object, written last.
"""

from __future__ import annotations

import json
import os


class _Caching:
    IMMUTABLE = 'public, max-age=31536000, immutable'
    # Sources update a few times a day; five minutes keeps a new run quick to appear.
    MANIFEST_CACHE = 'public, max-age=300, must-revalidate'


class LocalStore(_Caching):
    def __init__(self, root: str):
        self.root = root
        self.writes: list[str] = []

    def put(self, key: str, body: bytes, content_type: str, cache_control: str) -> None:
        path = os.path.join(self.root, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as fh:
            fh.write(body)
        self.writes.append(key)

    def get_json(self, key: str):
        try:
            with open(os.path.join(self.root, key), encoding='utf-8') as fh:
                return json.load(fh)
        except FileNotFoundError:
            return None


class S3Store(_Caching):
    """Writes to Sentinel's own bucket. Credentials come from the Lambda role (no keys anywhere)."""

    def __init__(self, bucket: str, client=None):
        import boto3  # provided by the Lambda Python runtime

        self.bucket = bucket
        self.client = client or boto3.client('s3')

    def put(self, key: str, body: bytes, content_type: str, cache_control: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType=content_type, CacheControl=cache_control)

    def get_json(self, key: str):
        from botocore.exceptions import ClientError

        try:
            obj = self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            if exc.response.get('Error', {}).get('Code') in ('NoSuchKey', '404'):
                return None  # first run: no manifest yet
            raise
        return json.loads(obj['Body'].read())
