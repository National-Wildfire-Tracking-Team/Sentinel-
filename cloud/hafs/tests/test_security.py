"""No credentials anywhere, no SDK, and NOAA hosts fixed in code."""

import os
import re

import pytest
from conftest import SERVICE_DIR

import source

SOURCES = sorted(os.path.join(SERVICE_DIR, f) for f in os.listdir(SERVICE_DIR) if f.endswith('.py'))


@pytest.mark.parametrize('path', SOURCES, ids=os.path.basename)
def test_no_credentials_or_sdk(path):
    with open(path, encoding='utf-8') as fh:
        text = fh.read()
    assert not re.search(r'\b(AKIA|ASIA)[0-9A-Z]{16}\b', text)
    assert not re.search(r'aws_(secret_access_key|session_token)|AWS_SECRET|boto3|botocore', text, re.I)


def test_hosts_are_fixed():
    assert source.BASE_URL == 'https://noaa-nws-hafs-pds.s3.us-east-1.amazonaws.com'
    assert source.NOMADS_URL.startswith('https://nomads.ncep.noaa.gov/')


@pytest.mark.parametrize('args', [
    ('hfsa', '2026100806', '../x', 'storm', 3),
    ('hfsa', '2026100806', '09l', 'storm/../../', 3),
    ('hf/sa', '2026100806', '09l', 'storm', 3),
    ('hfsa', '20261008060', '09l', 'storm', 3),
    ('hfsa', '2026100806', '09l', 'storm', -1),
])
def test_file_names_only_from_validated_parts(args):
    with pytest.raises(ValueError):
        source.file_name(*args)


def test_requests_stay_on_the_bucket_or_nomads():
    seen = []

    class Res:
        status = 206

        def __init__(self, n):
            self.n = n

        def read(self, limit):
            return b'x' * self.n

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

    def opener(req, timeout):
        seen.append(req.full_url)
        return Res(10)

    s = source.HafsSource(opener=opener, sleep=lambda _: None)
    s.fetch_range('hfsa', '2026100806', '09l', 'storm', 3, 0, 9)
    assert seen == ['https://noaa-nws-hafs-pds.s3.us-east-1.amazonaws.com/hfsa/20261008/06/'
                    '09l.2026100806.hfsa.storm.atm.f003.grb2']
