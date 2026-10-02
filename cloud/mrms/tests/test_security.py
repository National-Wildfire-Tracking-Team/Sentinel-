"""No credentials anywhere in the MRMS code path, and the source bucket is read anonymously."""

import os
import re

import pytest
from conftest import SERVICE_DIR

REPO_ROOT = os.path.abspath(os.path.join(SERVICE_DIR, '..', '..'))
FEATURE_PATHS = [
    'cloud/mrms',
    'src/app/api/mrms.js',
    'src/app/hooks/useMrms.js',
    'src/app/components/Map/layers/MrmsLayer.jsx',
    'src/app/components/LayerControl/MrmsControls.jsx',
    'src/app/components/MapControls/MrmsStatus.jsx',
    'src/app/context/MrmsContext.jsx',
    'infra/aws/lib/mrms-stack.mjs',
]
SECRET_PATTERNS = [
    re.compile(r'\b(AKIA|ASIA)[0-9A-Z]{16}\b'),
    re.compile(r'aws_secret_access_key\s*[=:]', re.I),
    re.compile(r'aws_session_token\s*[=:]', re.I),
    re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
]


def feature_files():
    for rel in FEATURE_PATHS:
        path = os.path.join(REPO_ROOT, rel)
        if os.path.isfile(path):
            yield path
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in ('__pycache__', '.pytest_cache', 'node_modules', '.venv')]
            for name in files:
                yield os.path.join(root, name)


@pytest.mark.parametrize('path', list(feature_files()), ids=lambda p: os.path.relpath(p, REPO_ROOT))
def test_no_credentials_in_source(path):
    text = open(path, encoding='utf-8', errors='ignore').read()
    for pattern in SECRET_PATTERNS:
        assert not pattern.search(text), f'{pattern.pattern} matched in {path}'


def test_source_reads_are_unsigned_https():
    text = open(os.path.join(SERVICE_DIR, 'source.py'), encoding='utf-8').read()
    assert 'boto' not in text and 'AWS_' not in text and 'Authorization' not in text
    assert "BASE_URL = f'https://{BUCKET}.s3.{REGION}.amazonaws.com'" in text


def test_only_the_store_touches_the_sdk():
    for name in os.listdir(SERVICE_DIR):
        if name.endswith('.py') and name != 'store.py':
            text = open(os.path.join(SERVICE_DIR, name), encoding='utf-8').read()
            assert 'boto' not in text, name
            assert 'AWS_ACCESS_KEY' not in text and 'AWS_SECRET' not in text, name
