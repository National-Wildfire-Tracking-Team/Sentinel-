/**
 * nwsAlertsServiceClient.test.js
 * Unit tests for the opt-in nws-alerts service client
 * (src/app/api/nwsAlertsService.js).
 *
 * The contract: a usable /v1 snapshot is returned as-is, and anything else
 * returns null so useWeatherAlerts falls back to the Netlify path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAlertsFromService, parseServiceResponse } from '../../src/app/api/nwsAlertsService';

const BASE = 'https://nws-alerts.test';

const body = (overrides = {}) => ({
  schemaVersion: 1,
  generatedAt: '2026-09-30T18:00:00.000Z',
  stale: false,
  alerts: [{ id: 'urn:oid:a', type: 'Red Flag Warning', geometry: null }],
  supplemental: [{ id: 'urn:oid:b', type: 'Flood Warning', source: 'NWS' }],
  counts: { alerts: 1, supplemental: 1 },
  sources: {},
  ...overrides,
});

function respond(payload, { ok = true, status = 200 } = {}) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok, status, json: () => Promise.resolve(payload) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseServiceResponse', () => {
  it('accepts a v1 snapshot', () => {
    const b = body();
    expect(parseServiceResponse(b)).toEqual({ alerts: b.alerts, supplemental: b.supplemental });
  });

  it('accepts an empty supplemental list', () => {
    expect(parseServiceResponse(body({ supplemental: [] }))?.supplemental).toEqual([]);
  });

  it.each([
    ['null', null],
    ['an unknown schema version', body({ schemaVersion: 2 })],
    ['a stale snapshot', body({ stale: true })],
    ['missing alerts', body({ alerts: undefined })],
    ['missing supplemental', body({ supplemental: undefined })],
    ['an empty nationwide feed', body({ alerts: [] })],
  ])('rejects %s', (_name, b) => {
    expect(parseServiceResponse(b)).toBeNull();
  });
});

describe('fetchAlertsFromService', () => {
  it('makes no request when the service is not configured', async () => {
    const fetchMock = respond(body());
    expect(await fetchAlertsFromService(null)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests /v1/alerts and returns both lists', async () => {
    const fetchMock = respond(body());
    const result = await fetchAlertsFromService(`${BASE}/`);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/alerts`);
    expect(result.alerts).toHaveLength(1);
    expect(result.supplemental).toHaveLength(1);
  });

  it('returns null on an HTTP error so the caller falls back', async () => {
    respond({ error: 'unavailable' }, { ok: false, status: 502 });
    expect(await fetchAlertsFromService(BASE)).toBeNull();
  });

  it('returns null on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    expect(await fetchAlertsFromService(BASE)).toBeNull();
  });

  it('returns null for a stale snapshot', async () => {
    respond(body({ stale: true }));
    expect(await fetchAlertsFromService(BASE)).toBeNull();
  });
});
