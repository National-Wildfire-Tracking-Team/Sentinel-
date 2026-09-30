/**
 * nwsAlertsService.test.js
 * Unit tests for the nws-alerts Cloud Run service's ingestion and cache
 * (cloud/nws-alerts/alerts.mjs).
 *
 * The service is meant to become a drop-in replacement for what every tab
 * builds today, so beyond its own behavior these tests pin parity with the
 * client modules it duplicates (noaaWeather.js, nwsMapServerAlerts.js).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SnapshotCache,
  buildSnapshot,
  fetchActiveAlerts,
  flattenGeometry,
  normalizeAlert,
} from '../../cloud/nws-alerts/alerts.mjs';
import { flattenGeometry as clientFlattenGeometry } from '../../src/app/api/noaaWeather';
import { fetchMapServerSupplement as clientSupplement } from '../../src/app/api/nwsMapServerAlerts';

const NWS = 'https://nws.test';
const WWA = 'https://wwa.test/WWA/MapServer';

const capId = (n) => `urn:oid:2.49.0.1.840.0.${String(n).padStart(40, '0')}.001.1`;
const polygon = { type: 'Polygon', coordinates: [[[-120, 37], [-119, 37], [-119, 38], [-120, 37]]] };

const nwsFeature = (n) => ({
  id: `${NWS}/alerts/${capId(n)}`,
  geometry: polygon,
  properties: {
    id: capId(n), event: 'Red Flag Warning', headline: 'h', description: 'd', instruction: 'i',
    severity: 'Severe', urgency: 'Expected', certainty: 'Likely', sent: 's', effective: 'e',
    onset: 'o', expires: 'x', senderName: 'NWS', areaDesc: 'Area', geocode: { UGC: ['CAZ001'] },
    affectedZones: [], parameters: {},
  },
});

const wwaFeature = (id) => ({
  type: 'Feature',
  geometry: polygon,
  properties: { prod_type: 'Flood Warning', sig: 'W', cap_id: id, issuance: 'a', expiration: 'b' },
});

const res = (body, ok = true, status = 200) =>
  Promise.resolve({ ok, status, text: () => Promise.resolve(JSON.stringify(body)), json: () => Promise.resolve(body) });

/**
 * Upstream fake. `pages` is a list of NWS alert-number arrays (one per page);
 * `wwa` maps layer → cap_ids. Geometry queries echo back the ids asked for.
 */
function upstream({ pages = [[1, 2]], wwa = { 0: [], 1: [] }, nwsFail = false, wwaFail = false } = {}) {
  return vi.fn((url) => {
    const u = new URL(url, 'https://app.test');
    if (u.pathname.endsWith('/alerts/active')) {
      if (nwsFail) return res({ error: 'down' }, false, 503);
      const page = Number(u.searchParams.get('cursor') || 0);
      const next = page + 1 < pages.length ? `${NWS}/alerts/active?cursor=${page + 1}` : undefined;
      return res({ features: pages[page].map(nwsFeature), pagination: next ? { next } : {} });
    }
    if (wwaFail) return Promise.reject(new Error('wwa down'));
    const layer = Number(u.pathname.match(/\/(\d+)\/query$/)[1]);
    if (u.searchParams.get('returnDistinctValues') === 'true') {
      return res({ features: (wwa[layer] || []).map((id) => ({ attributes: { cap_id: id } })) });
    }
    if (u.searchParams.get('where') === '1=1') {
      return res({ type: 'FeatureCollection', features: (wwa[layer] || []).map(wwaFeature) });
    }
    const ids = [...u.searchParams.get('where').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    return res({ type: 'FeatureCollection', features: ids.map(wwaFeature) });
  });
}

const snapshot = (fetchImpl, extra = {}) =>
  buildSnapshot({ fetchImpl, nwsApiBase: NWS, mapServerUrl: WWA, userAgent: 'test', ...extra });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parity with the client modules', () => {
  it('flattens geometry exactly like noaaWeather.flattenGeometry', () => {
    const cases = [
      null,
      polygon,
      { type: 'MultiPolygon', coordinates: [polygon.coordinates, polygon.coordinates] },
      { type: 'GeometryCollection', geometries: [polygon, { type: 'Point', coordinates: [0, 0] }] },
      { type: 'GeometryCollection', geometries: [polygon, polygon] },
      { type: 'Point', coordinates: [0, 0] },
    ];
    for (const g of cases) expect(flattenGeometry(g)).toEqual(clientFlattenGeometry(g));
  });

  it('normalizes api.weather.gov alerts with the fields the UI reads', () => {
    expect(Object.keys(normalizeAlert(nwsFeature(1))).sort()).toEqual([
      'affectedArea', 'affectedZones', 'certainty', 'description', 'effective', 'expires',
      'geocode', 'geometry', 'headline', 'id', 'instruction', 'onset', 'parameters',
      'senderName', 'sent', 'severity', 'type', 'urgency',
    ]);
    expect(normalizeAlert(nwsFeature(1))).toMatchObject({
      id: capId(1), type: 'Red Flag Warning', affectedArea: 'Area', geometry: polygon,
    });
  });

  it('produces the same supplemental alerts as the client ID-first lookup', async () => {
    const wwa = { 0: [capId(1)], 1: [capId(2), capId(3), capId(4)] };
    const known = new Set([capId(1), capId(2)]);

    const server = await snapshot(upstream({ pages: [[1, 2]], wwa }));

    // The client module fetches relative /api/nws/wwa URLs; route them to
    // the same fake upstream.
    vi.stubGlobal('fetch', upstream({ wwa }));
    const client = await clientSupplement(known);

    expect(server.body.supplemental).toEqual(client.alerts);
  });
});

describe('fetchActiveAlerts', () => {
  it('follows pagination across every page', async () => {
    const fetchImpl = upstream({ pages: [[1, 2], [3], [4]] });
    const stats = { upstreamRequests: 0, upstreamBytes: 0, upstreamMs: 0 };

    const { alerts, pages } = await fetchActiveAlerts({ fetchImpl, baseUrl: NWS, userAgent: 'ua', stats });

    expect(pages).toBe(3);
    expect(alerts.map((a) => a.id)).toEqual([1, 2, 3, 4].map(capId));
    expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toBe('ua');
    expect(stats.upstreamRequests).toBe(3);
  });

  it('refuses to follow pagination off the NWS origin', async () => {
    const fetchImpl = vi.fn(() => res({ features: [nwsFeature(1)], pagination: { next: 'https://evil.test/x' } }));
    await expect(fetchActiveAlerts({ fetchImpl, baseUrl: NWS, userAgent: 'ua' })).rejects.toThrow(/origin/);
  });

  it('treats an empty nationwide feed as a failure, like the client', async () => {
    await expect(
      fetchActiveAlerts({ fetchImpl: upstream({ pages: [[]] }), baseUrl: NWS, userAgent: 'ua' }),
    ).rejects.toThrow(/no active alerts/);
  });

  it('rejects a malformed response', async () => {
    const fetchImpl = vi.fn(() => res({ nope: true }));
    await expect(fetchActiveAlerts({ fetchImpl, baseUrl: NWS, userAgent: 'ua' })).rejects.toThrow(/malformed/);
  });
});

describe('buildSnapshot', () => {
  it('builds a versioned snapshot of primary + genuinely missing supplemental alerts', async () => {
    const { body, stats } = await snapshot(upstream({ pages: [[1, 2]], wwa: { 0: [], 1: [capId(2), capId(9)] } }));

    expect(body).toMatchObject({ schemaVersion: 1, stale: false, counts: { alerts: 2, supplemental: 1 } });
    expect(body.supplemental.map((a) => a.id)).toEqual([capId(9)]);
    expect(stats.mapServer).toMatchObject({ mode: 'id-first', missingIds: 1, geometryRequests: 1 });
  });

  it('downloads no MapServer geometry when every id is already known', async () => {
    const fetchImpl = upstream({ pages: [[1, 2]], wwa: { 0: [capId(1)], 1: [capId(2)] } });
    const { body } = await snapshot(fetchImpl);

    expect(body.supplemental).toEqual([]);
    const geometryCalls = fetchImpl.mock.calls.filter(([u]) => u.startsWith(WWA) && !u.includes('returnDistinctValues'));
    expect(geometryCalls).toHaveLength(0);
  });

  it('de-dups the full-query fallback server-side', async () => {
    const wwa = { 0: [], 1: [capId(1), capId(8)] };
    const base = upstream({ pages: [[1]], wwa });
    const fetchImpl = vi.fn((url) =>
      url.includes('returnDistinctValues') ? Promise.reject(new Error('id query down')) : base(url));

    const { body } = await snapshot(fetchImpl);

    expect(body.sources.mapServer.mode).toBe('fallback');
    expect(body.supplemental.map((a) => a.id)).toEqual([capId(8)]);
  });

  it('still succeeds when the MapServer supplement is down', async () => {
    const { body } = await snapshot(upstream({ pages: [[1]], wwaFail: true }));
    expect(body.counts).toEqual({ alerts: 1, supplemental: 0 });
  });

  it('fails when the primary NWS feed fails', async () => {
    await expect(snapshot(upstream({ nwsFail: true }))).rejects.toThrow(/HTTP 503/);
  });

  it('keeps the ETag stable when only generatedAt changes', async () => {
    const a = await snapshot(upstream(), { now: () => new Date(0) });
    const b = await snapshot(upstream(), { now: () => new Date(60_000) });
    const c = await snapshot(upstream({ pages: [[1, 2, 3]] }));
    expect(a.etag).toBe(b.etag);
    expect(c.etag).not.toBe(a.etag);
  });
});

describe('SnapshotCache', () => {
  function clock(start = 0) {
    let t = start;
    return { now: () => t, advance: (ms) => { t += ms; } };
  }

  const snap = (n) => ({ body: { n, stale: false }, etag: `"${n}"` });

  it('serves a fresh snapshot within the TTL without rebuilding', async () => {
    const c = clock();
    const build = vi.fn().mockResolvedValue(snap(1));
    const cache = new SnapshotCache({ ttlMs: 45_000, maxStaleMs: 300_000, build, now: c.now });

    expect((await cache.get()).cacheStatus).toBe('miss');
    c.advance(44_000);
    expect((await cache.get()).cacheStatus).toBe('hit');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('rebuilds once the TTL expires', async () => {
    const c = clock();
    const build = vi.fn().mockResolvedValueOnce(snap(1)).mockResolvedValueOnce(snap(2));
    const cache = new SnapshotCache({ ttlMs: 45_000, maxStaleMs: 300_000, build, now: c.now });

    await cache.get();
    c.advance(45_000);
    const { snapshot: s, cacheStatus } = await cache.get();
    expect(cacheStatus).toBe('miss');
    expect(s.body.n).toBe(2);
  });

  it('shares one upstream build between concurrent requests', async () => {
    let resolve;
    const build = vi.fn(() => new Promise((r) => { resolve = r; }));
    const cache = new SnapshotCache({ ttlMs: 45_000, maxStaleMs: 300_000, build });

    const pending = [cache.get(), cache.get(), cache.get()];
    resolve(snap(1));
    const results = await Promise.all(pending);

    expect(build).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.cacheStatus)).toEqual(['miss', 'coalesced', 'coalesced']);
  });

  it('serves the last snapshot flagged stale when a rebuild fails within maxStale', async () => {
    const c = clock();
    const build = vi.fn().mockResolvedValueOnce(snap(1)).mockRejectedValueOnce(new Error('down'));
    const cache = new SnapshotCache({ ttlMs: 45_000, maxStaleMs: 300_000, build, now: c.now });

    await cache.get();
    c.advance(60_000);
    const { snapshot: s, cacheStatus } = await cache.get();

    expect(cacheStatus).toBe('stale');
    expect(s.body).toEqual({ n: 1, stale: true });
  });

  it('never presents a snapshot older than TTL + maxStale', async () => {
    const c = clock();
    const build = vi.fn().mockResolvedValueOnce(snap(1)).mockRejectedValue(new Error('down'));
    const cache = new SnapshotCache({ ttlMs: 45_000, maxStaleMs: 300_000, build, now: c.now });

    await cache.get();
    c.advance(345_000);
    await expect(cache.get()).rejects.toThrow('down');
  });

  it('recovers after a build that throws synchronously', async () => {
    const build = vi.fn()
      .mockImplementationOnce(() => { throw new Error('sync'); })
      .mockResolvedValueOnce(snap(2));
    const cache = new SnapshotCache({ ttlMs: 45_000, maxStaleMs: 300_000, build });

    await expect(cache.get()).rejects.toThrow('sync');
    expect((await cache.get()).snapshot.body.n).toBe(2);
  });
});
