/**
 * cloud/hurricane-models: the per-storm a-deck cache, the router and the
 * active-storm list, driven with a fake fetch and clock (no NOAA requests).
 * Also pins the shared ATCF modules to their src/app/api/atcf twins.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  ActiveStormsCache, NotFoundError, RateLimiter, StormStore, adeckUrls, createRouter, decodeDeck, normalizeActiveStorms,
} from '../../cloud/hurricane-models/service.mjs';
import { parseStormId } from '../../cloud/hurricane-models/guidance.mjs';

const root = process.cwd();
const ISAIAS = readFileSync(join(root, 'Tests/Vitest/fixtures/nhc/aal092026-models.dat'), 'utf8');
const CURRENT_STORMS = JSON.parse(readFileSync(join(root, 'Tests/Vitest/fixtures/nhc/CurrentStorms-sample.json'), 'utf8'));
const STORM = parseStormId('AL092026');
const T0 = Date.parse('2026-10-08T12:40:00Z');
const LAST_MODIFIED = 'Thu, 08 Oct 2026 12:30:30 GMT';

function response(status, { body = null, headers = {} } = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => h.get(k.toLowerCase()) ?? null },
    arrayBuffer: async () => body,
    json: async () => body,
  };
}

const deck = (text = ISAIAS) => {
  const gz = gzipSync(text);
  return response(200, { body: gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.length), headers: { ETag: '"v1"', 'Last-Modified': LAST_MODIFIED } });
};

function setup({ fetchImpl, ttlMs = 300_000, maxStaleMs = 3_600_000, ...rest } = {}) {
  const clock = { t: T0 };
  const logs = [];
  const log = (severity, message, fields) => logs.push({ severity, message, ...fields });
  const store = new StormStore({ fetchImpl, now: () => clock.t, log, ttlMs, maxStaleMs, ...rest });
  return { store, clock, logs };
}

describe('shared modules', () => {
  it.each(['atcf.mjs', 'registry.mjs', 'guidance.mjs'])('cloud/hurricane-models/%s is byte-identical to src/app/api/atcf/', (file) => {
    expect(readFileSync(join(root, 'cloud/hurricane-models', file), 'utf8'))
      .toBe(readFileSync(join(root, 'src/app/api/atcf', file), 'utf8'));
  });
});

describe('a-deck location', () => {
  it('only ever points at NHC, built from a validated id', () => {
    expect(adeckUrls(STORM, 2026)).toEqual(['https://ftp.nhc.noaa.gov/atcf/aid_public/aal092026.dat.gz']);
    expect(adeckUrls(parseStormId('AL092025'), 2026)).toEqual([
      'https://ftp.nhc.noaa.gov/atcf/archive/2025/aal092025.dat.gz',
      'https://ftp.nhc.noaa.gov/atcf/aid_public/aal092025.dat.gz',
    ]);
    expect(adeckUrls(parseStormId('AL092022'), 2026)).toEqual(['https://ftp.nhc.noaa.gov/atcf/archive/2022/aal092022.dat.gz']);
  });

  it('inflates gzip and passes plain text through', () => {
    expect(decodeDeck(gzipSync('AL, 09'))).toBe('AL, 09');
    expect(decodeDeck(Buffer.from('AL, 09'))).toBe('AL, 09');
  });
});

describe('StormStore', () => {
  it('downloads once, then serves from cache within the TTL', async () => {
    const fetchImpl = vi.fn(async () => deck());
    const { store, logs } = setup({ fetchImpl });
    const first = await store.get(STORM);
    expect(first.cacheStatus).toBe('miss');
    expect(first.entry.source).toEqual({
      url: 'https://ftp.nhc.noaa.gov/atcf/aid_public/aal092026.dat.gz', etag: '"v1"', lastModified: '2026-10-08T12:30:30Z',
    });
    expect((await store.get(STORM)).cacheStatus).toBe('hit');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const ingest = logs.find((l) => l.message === 'adeck_ingested');
    expect(ingest).toMatchObject({ stormId: 'AL092026', latestCycle: '2026100812', malformed: 0 });
    expect(JSON.stringify(logs)).not.toContain('AL, 09,'); // never raw NOAA lines
    const availability = logs.find((l) => l.message === 'model_availability');
    expect(availability.unavailable).toEqual(['EMX']);
    expect(availability.points.OFCL).toBe(5);
  });

  it('revalidates after the TTL; an unchanged deck is a 304, not a re-download', async () => {
    const fetchImpl = vi.fn(async () => deck());
    const { store, clock, logs } = setup({ fetchImpl });
    const { entry } = await store.get(STORM);
    clock.t += 301_000;
    fetchImpl.mockImplementationOnce(async (url, { headers }) => {
      expect(headers['If-None-Match']).toBe('"v1"');
      expect(headers['If-Modified-Since']).toBe(LAST_MODIFIED);
      return response(304);
    });
    const again = await store.get(STORM);
    expect(again).toMatchObject({ cacheStatus: 'revalidated' });
    expect(again.entry).toBe(entry);
    expect(logs.some((l) => l.message === 'adeck_not_modified')).toBe(true);
  });

  it('logs new cycles and which models moved to a new run', async () => {
    const older = ISAIAS.split('\n').filter((l) => !l.includes('2026100812') && !/2026100806, 03, +HFSB/.test(l)).join('\n');
    const fetchImpl = vi.fn(async () => deck(older));
    const { store, clock, logs } = setup({ fetchImpl });
    await store.get(STORM);
    clock.t += 301_000;
    fetchImpl.mockImplementationOnce(async () => deck());
    const { entry, cacheStatus } = await store.get(STORM);
    expect(cacheStatus).toBe('miss');
    expect(entry.version).toBe(2);
    expect(logs.find((l) => l.message === 'cycle_change')).toMatchObject({ from: '2026-10-08T06:00:00Z', to: '2026-10-08T12:00:00Z' });
    expect(logs.find((l) => l.message === 'model_cycle_change')).toMatchObject({ model: 'HFSB', from: '2026-10-08T00:00:00Z', to: '2026-10-08T06:00:00Z' });
  });

  it('keeps serving the last good deck, flagged stale, while NOAA is down — then gives up', async () => {
    const fetchImpl = vi.fn(async () => deck());
    const { store, clock, logs } = setup({ fetchImpl, maxStaleMs: 3_600_000 });
    await store.get(STORM);
    fetchImpl.mockImplementation(async () => response(503));
    clock.t += 301_000;
    expect((await store.get(STORM)).cacheStatus).toBe('stale');
    expect(logs.some((l) => l.message === 'noaa_fetch_failed' && l.status === 503)).toBe(true);
    clock.t += 3_600_000;
    await expect(store.get(STORM)).rejects.toThrow(/503/);
  });

  it('treats a network error like an outage', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const { store } = setup({ fetchImpl });
    await expect(store.get(STORM)).rejects.toThrow(/fetch failed/);
    expect(store.counters.fetchFailures).toBe(1);
  });

  it('remembers storms NHC has no file for', async () => {
    const fetchImpl = vi.fn(async () => response(404));
    const { store } = setup({ fetchImpl });
    const ghost = parseStormId('AL482026');
    await expect(store.get(ghost)).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.get(ghost)).rejects.toBeInstanceOf(NotFoundError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a file with no usable records instead of caching it', async () => {
    const { store, logs } = setup({ fetchImpl: async () => deck('<html>maintenance</html>') });
    await expect(store.get(STORM)).rejects.toThrow(/no usable records/);
    expect(logs.some((l) => l.message === 'adeck_parse_failed')).toBe(true);
    expect(store.size).toBe(0);
  });

  it('shares one download between concurrent requests', async () => {
    let release;
    const fetchImpl = vi.fn(() => new Promise((resolve) => { release = () => resolve(deck()); }));
    const { store } = setup({ fetchImpl });
    const a = store.get(STORM);
    const b = store.get(STORM);
    release();
    expect((await a).cacheStatus).toBe('miss');
    expect((await b).cacheStatus).toBe('coalesced');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used storm past its budgets', async () => {
    // The Isaias lines refiled under whichever storm was asked for.
    const fetchImpl = async (url) => {
      const [, basin, num] = url.match(/a(\w\w)(\d\d)2026\.dat\.gz$/);
      return deck(ISAIAS.replaceAll('AL, 09,', `${basin.toUpperCase()}, ${num},`));
    };
    const { store, logs } = setup({ fetchImpl, maxEntries: 2 });
    for (const id of ['AL092026', 'EP182026', 'EP202026']) await store.get(parseStormId(id));
    expect([...store.entries.keys()]).toEqual(['EP182026', 'EP202026']);
    expect(logs.find((l) => l.message === 'storm_evicted')).toMatchObject({ stormId: 'AL092026' });

    const small = setup({ fetchImpl, maxRecords: 500 });
    await small.store.get(parseStormId('AL092026'));
    await small.store.get(parseStormId('EP182026'));
    expect([...small.store.entries.keys()]).toEqual(['EP182026']);
  });
});

function router({ fetchImpl = async () => deck(), activeFetch = async () => response(200, { body: CURRENT_STORMS }), limit = 100 } = {}) {
  const { store, clock, logs } = setup({ fetchImpl });
  const activeStorms = new ActiveStormsCache({ fetchImpl: activeFetch, now: () => clock.t, ttlMs: 120_000, maxStaleMs: 3_600_000 });
  const limiter = new RateLimiter({ limit, windowMs: 60_000, now: () => clock.t });
  return { ...createRouter({ store, activeStorms, limiter, now: () => clock.t }), store, clock, logs };
}

const get = (r, url, headers = {}) => r.route({ method: 'GET', url, headers, clientKey: '1.2.3.4' });

describe('GET /v1/hurricanes/{stormId}/models', () => {
  it('returns the normalized response with an ETag and a cache lifetime', async () => {
    const r = router();
    const res = await get(r, '/v1/hurricanes/al092026/models');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.json);
    expect(body).toMatchObject({ stormId: 'AL092026', stormName: 'ISAIAS', stale: false, updatedAt: '2026-10-08T12:30:30Z' });
    expect(body.models.find((m) => m.id === 'EMX').status).toBe('unavailable');
    expect(res.headers['Cache-Control']).toBe('public, max-age=0, s-maxage=300, must-revalidate');
    expect(res.headers.ETag).toMatch(/^".+"$/);
    expect((await get(r, '/v1/hurricanes/AL092026/models', { 'if-none-match': res.headers.ETag })).status).toBe(304);
  });

  it('validates the storm id and query, and never fetches for a bad one', async () => {
    const fetchImpl = vi.fn(async () => deck());
    const r = router({ fetchImpl });
    for (const url of [
      '/v1/hurricanes/XX092026/models',
      '/v1/hurricanes/..%2F..%2Fetc/models',
      '/v1/hurricanes/%E0%A4%A/models',
      '/v1/hurricanes/AL092099/models',
      '/v1/hurricanes/AL092026/models?url=https://example.com',
      '/v1/hurricanes/AL092026/models?cycle=yesterday',
    ]) {
      expect((await get(r, url)).status, url).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers as of an earlier cycle, and 404s a cycle the deck lacks', async () => {
    const r = router();
    const res = await get(r, '/v1/hurricanes/AL092026/models?cycle=2026-10-07T00:00:00Z');
    expect(JSON.parse(res.json)).toMatchObject({ asOf: '2026-10-07T00:00:00Z', historical: true });
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=3600/);
    expect((await get(r, '/v1/hurricanes/AL092026/models?cycle=2026100518')).status).toBe(404);
  });

  it('flags a body served during an outage as stale and keeps it out of shared caches', async () => {
    const fetchImpl = vi.fn(async () => deck());
    const r = router({ fetchImpl });
    await get(r, '/v1/hurricanes/AL092026/models');
    fetchImpl.mockImplementation(async () => response(500));
    r.clock.t += 301_000;
    const res = await get(r, '/v1/hurricanes/AL092026/models');
    expect(JSON.parse(res.json)).toMatchObject({ stale: true, staleReason: 'upstream-unavailable' });
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers['X-Sentinel-Cache']).toBe('stale');
  });

  it('returns 404 for an unknown storm and 502 when NOAA is down with nothing cached', async () => {
    expect((await get(router({ fetchImpl: async () => response(404) }), '/v1/hurricanes/AL452026/models')).status).toBe(404);
    expect((await get(router({ fetchImpl: async () => response(502) }), '/v1/hurricanes/AL092026/models')).status).toBe(502);
  });

  it('rate-limits a client', async () => {
    const r = router({ limit: 1 });
    await get(r, '/v1/hurricanes/AL092026/models');
    expect((await get(r, '/v1/hurricanes/AL092026/models')).status).toBe(429);
  });
});

describe('GET /v1/hurricanes (active storms)', () => {
  it('normalizes NHC CurrentStorms.json', () => {
    expect(normalizeActiveStorms(CURRENT_STORMS)[0]).toEqual({
      stormId: 'AL092026', basin: 'AL', stormNumber: 9, year: 2026, name: 'Isaias', classification: 'HU',
      intensityKt: 70, pressureMb: 975, latitude: 23.7, longitude: -90.6, movementDirDeg: 60, movementSpeedKt: 9,
      lastUpdate: '2026-10-08T12:00:00.000Z', binNumber: 'AT4', modelsPath: '/v1/hurricanes/AL092026/models',
    });
    expect(normalizeActiveStorms({ activeStorms: [{ id: 'nonsense' }, null] })).toEqual([]);
    expect(normalizeActiveStorms(null)).toEqual([]);
  });

  it('lists the active storms with links to their models', async () => {
    const res = await get(router(), '/v1/hurricanes');
    expect(res.status).toBe(200);
    expect(res.body.storms.map((s) => s.stormId)).toEqual(['AL092026', 'EP182026', 'EP202026']);
    expect((await get(router(), '/v1/hurricanes?foo=1')).status).toBe(400);
    expect((await get(router({ activeFetch: async () => response(500) }), '/v1/hurricanes')).status).toBe(502);
  });

  it('only answers GET and known paths', async () => {
    const r = router();
    expect((await r.route({ method: 'POST', url: '/v1/hurricanes' })).status).toBe(405);
    expect((await get(r, '/v1/elsewhere')).status).toBe(404);
    expect((await get(r, '/health')).body).toMatchObject({ ok: true, schemaVersion: 1 });
  });
});
