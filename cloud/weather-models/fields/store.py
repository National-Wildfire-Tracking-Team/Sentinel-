"""
fields/store.py
Where field frames and the manifest are written: S3 in production, a local
directory for development and tests. Both take the same object keys.

Frame keys include the run, so a frame never changes once written and is
cached "immutable". The manifest is the only mutable object, written last,
with a short cache lifetime. Past that, browsers and CloudFront may answer
with the old manifest for up to 5 more minutes while they fetch the new one
(stale-while-revalidate), so opening the Models tab never waits on S3. An
old manifest is harmless: its frames stay in the bucket for days.
"""

from __future__ import annotations

import json
import os

IMMUTABLE = 'public, max-age=31536000, immutable'
MANIFEST_CACHE = 'public, max-age=60, stale-while-revalidate=300'


class LocalStore:
    def __init__(self, root: str):
        self.root = root

    def put(self, key: str, body: bytes, content_type: str, cache_control: str) -> None:
        path = os.path.join(self.root, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as fh:
            fh.write(body)

    def get_json(self, key: str):
        try:
            with open(os.path.join(self.root, key), encoding='utf-8') as fh:
                return json.load(fh)
        except FileNotFoundError:
            return None


class S3Store:
    """Writes to the fields bucket. Credentials come from the Lambda role (no keys anywhere)."""

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
