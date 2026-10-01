"""No credentials anywhere in the weather-model code path, and nothing that needs one."""

import os
import re
import subprocess

import pytest
from conftest import SERVICE_DIR

REPO_ROOT = os.path.abspath(os.path.join(SERVICE_DIR, '..', '..'))

# Files that make up the weather-model feature end to end.
FEATURE_PATHS = [
    'cloud/weather-models',
    'src/app/api/weatherModels.js',
    'src/app/hooks/useModelForecast.js',
    'src/app/hooks/useWeatherModels.js',
    'src/app/context/WeatherModelsContext.jsx',
    'src/app/utils/weatherModelsLink.js',
    'src/app/components/WeatherModels',
    'infra/aws/lib/weather-models-stack.mjs',
]

SECRET_PATTERNS = [
    re.compile(r'\b(AKIA|ASIA)[0-9A-Z]{16}\b'),  # AWS access key id
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


def test_feature_files_exist():
    found = list(feature_files())
    assert any(f.endswith('app.py') for f in found)


@pytest.mark.parametrize('path', list(feature_files()), ids=lambda p: os.path.relpath(p, REPO_ROOT))
def test_no_credentials_in_source(path):
    with open(path, encoding='utf-8', errors='ignore') as fh:
        text = fh.read()
    for pattern in SECRET_PATTERNS:
        assert not pattern.search(text), f'{pattern.pattern} matched in {path}'


def test_service_never_reads_aws_credentials():
    # Public Open Data buckets are read anonymously, so the code has no
    # reason to touch credential env vars or boto/botocore.
    for path in feature_files():
        if not path.endswith('.py') or '/tests/' in path:
            continue
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
        assert 'AWS_SECRET_ACCESS_KEY' not in text and 'AWS_ACCESS_KEY_ID' not in text, path
        assert 'aws_access_key_id' not in text and 'aws_secret_access_key' not in text, path
        # Only the field builder's S3 writer uses boto3, with the Lambda role's
        # credentials; the forecast service reads the datasets anonymously.
        if not path.endswith('fields/store.py'):
            assert 'import boto' not in text, path


def test_frontend_never_talks_to_s3_directly():
    for path in feature_files():
        if not path.endswith(('.js', '.jsx')):
            continue
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
        assert 'amazonaws.com' not in text and 's3://' not in text, path
        # No Zarr/Icechunk reader in the browser bundle (mentions in comments are fine).
        assert not re.search(r'''(from|import\(|require\()\s*['"][^'"]*(zarr|icechunk)''', text, re.I), path


def test_no_env_files_tracked():
    try:
        tracked = subprocess.run(['git', 'ls-files', 'cloud/weather-models'], cwd=REPO_ROOT,
                                 capture_output=True, text=True, check=True).stdout.split()
    except (OSError, subprocess.CalledProcessError):
        pytest.skip('git not available')
    assert not [f for f in tracked if os.path.basename(f).startswith('.env')]
