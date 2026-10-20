"""Shared fixtures: the service directory on sys.path, and a FEMS stand-in
that replays responses recorded from the live service on 2026-10-20
(tests/fixtures; three stations' rows, two inactive stations' metadata)."""

import os
import sys

import pytest

SERVICE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FIXTURES = os.path.join(os.path.dirname(__file__), 'fixtures')
sys.path.insert(0, SERVICE_DIR)

import json  # noqa: E402

import fems  # noqa: E402


def fixture_text(name):
    with open(os.path.join(FIXTURES, name), encoding='utf-8') as fh:
        return fh.read()


class FakeFems:
    """Replays the recorded responses. `fail_batches` makes the nth daily_summary calls raise."""

    def __init__(self, fail_stations=False, fail_batches=(), metadata=None, summary=None):
        self.fail_stations = fail_stations
        self.fail_batches = set(fail_batches)
        self.metadata = metadata if metadata is not None else json.loads(fixture_text('fems_station_metadata.json'))['data']['stationMetaData']['data']
        self.summary = summary if summary is not None else fixture_text('fems_nfdr_daily_summary.csv')
        self.calls = []

    def stations(self):
        if self.fail_stations:
            raise fems.SourceError('HTTPError: 503')
        return self.metadata

    def daily_summary(self, ids, start, end):
        n = len(self.calls)
        self.calls.append((list(ids), start, end))
        if n in self.fail_batches:
            raise fems.SourceError('timed out')
        return self.summary


@pytest.fixture
def fake_fems():
    return FakeFems


def caps_xml(times):
    """A WMS 1.3.0 capabilities fragment with a time dimension, as USGS's GeoServer returns it."""
    return ('<WMS_Capabilities><Capability><Layer><Layer queryable="1"><Name>x</Name>'
            f'<Dimension name="time" default="current" units="ISO8601">{",".join(times)}</Dimension>'
            '</Layer></Layer></Capability></WMS_Capabilities>')


class FakeWfpi:
    """Layer 1 newest 2026-10-19 and layer 7 newest 2026-10-25, as observed on 2026-10-20."""

    def __init__(self, day1='2026-10-19', day7='2026-10-25', fail=False):
        self.day1, self.day7, self.fail = day1, day7, fail

    def capabilities(self, n):
        import wfpi
        if self.fail:
            raise wfpi.SourceError('HTTPError: 500')
        newest = self.day1 if n == 1 else self.day7
        return caps_xml(['2008-08-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', f'{newest}T00:00:00.000Z'])


@pytest.fixture
def fake_wfpi():
    return FakeWfpi
