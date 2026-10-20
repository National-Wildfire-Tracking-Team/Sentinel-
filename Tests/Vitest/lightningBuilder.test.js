// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_START, glmKey, h5, makeGlm } from './fixtures/glm/makeGlm.js';
import { GlmError, createGlmReader } from '../../supabase/functions/lightning-builder/glm.mjs';
import { GlmSource, SourceError, hourPrefix, keyTime } from '../../supabase/functions/lightning-builder/source.mjs';
import { MemoryStore, StorageStore, gzip } from '../../supabase/functions/lightning-builder/store.mjs';
import {
  LATEST_CONTENT_TYPE, LATEST_KEY, LightningBuilder, decodeFlashes, inArea, nearestTo, roundHalfEven,
} from '../../supabase/functions/lightning-builder/builder.mjs';

const readFlashes = createGlmReader(h5);
const NOW = Date.UTC(2026, 9, 18, 19, 0, 0);
const MIN = 60_000;

describe('glm', () => {
  it('reads good flashes with unpacked time and energy', () => {
    const out = readFlashes(makeGlm([
      [35.5, -97.5, 4.0, 2e-14, 0],
      [40.0, -100.0, 12.5, 5e-15, 0],
      [41.0, -101.0, 15.0, 5e-15, 1], // degraded: dropped
    ]));
    expect(out.platform).toBe('G19');
    expect(out.subLon).toBeCloseTo(-75.2, 5);
    expect(out.start).toBe(DEFAULT_START / 1000);
    expect(out.end).toBe(DEFAULT_START / 1000 + 20);
    expect(Array.from(out.lat)).toEqual([35.5, 40.0]);
    expect(Array.from(out.lon)).toEqual([-97.5, -100.0]);
    // int16 storage read as unsigned, then scale + offset (offsets above ~7.5 s are negative as int16)
    const sec = Array.from(out.t, (t) => t - DEFAULT_START / 1000);
    expect(sec[0]).toBeCloseTo(4.0, 3);
    expect(sec[1]).toBeCloseTo(12.5, 3);
    expect(Math.abs(out.energy[0] - 2e-14)).toBeLessThan(1e-15); // stored in ~1 fJ steps
    expect(Math.abs(out.energy[1] - 5e-15)).toBeLessThan(1e-15);
  });

  it('an empty file has no flashes', () => {
    expect(readFlashes(makeGlm([])).lat.length).toBe(0);
  });

  it('rejects non-HDF5 bytes', () => {
    expect(() => readFlashes(new TextEncoder().encode('not a netcdf file'))).toThrow(GlmError);
  });
});

describe('source', () => {
  it('parses key times and hour prefixes', () => {
    const t = Date.UTC(2026, 9, 18, 18, 49, 20);
    expect(keyTime(glmKey('goes19', t))).toBe(t);
    expect(keyTime('nope.nc')).toBeNull();
    expect(hourPrefix(t)).toBe('GLM-L2-LCFA/2026/291/18/');
  });

  const listing = (keys, { truncated = false, token } = {}) => new Response(
    '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
    + keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')
    + `<IsTruncated>${truncated}</IsTruncated>${token ? `<NextContinuationToken>${token}</NextContinuationToken>` : ''}</ListBucketResult>`,
  );

  it('lists each hour of the window, unsigned, in order', async () => {
    const t0 = Date.UTC(2026, 9, 18, 18, 55, 0);
    const t1 = Date.UTC(2026, 9, 18, 19, 0, 20);
    const early = Date.UTC(2026, 9, 18, 18, 40, 0);
    const byPrefix = { [hourPrefix(t0)]: [glmKey('goes19', early), glmKey('goes19', t0)], [hourPrefix(t1)]: [glmKey('goes19', t1)] };
    const fetchImpl = vi.fn(async (url, init) => {
      expect(init.headers.Authorization).toBeUndefined();
      return listing(byPrefix[new URL(url).searchParams.get('prefix')] ?? []);
    });
    const listed = await new GlmSource({ fetchImpl }).listSince('goes19', Date.UTC(2026, 9, 18, 18, 50), t1);
    expect(listed.map(([t]) => t)).toEqual([t0, t1]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url] of fetchImpl.mock.calls) expect(url).toMatch(/^https:\/\/noaa-goes19\.s3\.us-east-1\.amazonaws\.com\/\?/);
  });

  it('follows continuation tokens', async () => {
    const t = Date.UTC(2026, 9, 18, 18, 55, 0);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(listing([glmKey('goes18', t)], { truncated: true, token: 'tok+1' }))
      .mockResolvedValueOnce(listing([glmKey('goes18', t + 20_000)]));
    const listed = await new GlmSource({ fetchImpl }).listSince('goes18', t - MIN, t + MIN);
    expect(listed).toHaveLength(2);
    expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('continuation-token')).toBe('tok+1');
  });

  it('failures, HTTP errors and oversized objects are SourceErrors', async () => {
    await expect(new GlmSource({ fetchImpl: async () => { throw new TypeError('boom'); } }).fetchFile('goes18', 'x.nc')).rejects.toBeInstanceOf(SourceError);
    await expect(new GlmSource({ fetchImpl: async () => new Response('', { status: 503 }) }).fetchFile('goes18', 'x.nc')).rejects.toBeInstanceOf(SourceError);
    const big = async () => new Response('x', { headers: { 'content-length': String(64 * 1024 * 1024) } });
    await expect(new GlmSource({ fetchImpl: big }).fetchFile('goes18', 'x.nc')).rejects.toThrow(/larger than expected/);
  });
});

/** files: { sat: [[startMs, flashes]] } */
class FakeSource {
  constructor(files, { failList = [], failFetch = [] } = {}) {
    this.files = Object.fromEntries(Object.entries(files).map(([sat, entries]) => [
      sat, new Map(entries.map(([t, fl]) => [glmKey(sat, t), [t, fl]])),
    ]));
    this.failList = new Set(failList);
    this.failFetch = new Set(failFetch);
    this.fetched = [];
  }

  async listSince(sat, sinceMs, untilMs) {
    if (this.failList.has(sat)) throw new SourceError('listing failed');
    return [...(this.files[sat] ?? new Map())].filter(([, [t]]) => sinceMs <= t && t <= untilMs)
      .map(([k, [t]]) => [t, k]).sort((a, b) => a[0] - b[0]);
  }

  async fetchFile(sat, key) {
    this.fetched.push(key);
    if (this.failFetch.has(key)) throw new SourceError('download failed');
    const [t, flashes] = this.files[sat].get(key);
    return makeGlm(flashes, { start: t, platform: { goes19: 'G19', goes18: 'G18' }[sat] });
  }
}

const builder = (source, store, now = NOW, opts = {}) => new LightningBuilder(source, store, readFlashes, { clock: () => now / 1000, ...opts });

describe('builder', () => {
  it('area and satellite ownership', () => {
    expect([[35, -97], [35, -120], [5, -97], [52, 175]].map(([lat, lon]) => inArea(lat, lon))).toEqual([true, true, false, true]);
    // -97 is nearer GOES-East (-75.2); -120 nearer GOES-West (-137.2); 175°E is West's (across the antimeridian)
    expect([-97, -120, -97, 175].map((lon) => nearestTo('goes19', lon))).toEqual([true, false, true, false]);
    expect([-97, -120, -97, 175].map((lon) => nearestTo('goes18', lon))).toEqual([false, true, false, true]);
  });

  it('rounds halves to even, like numpy', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 2.4, -2.6].map(roundHalfEven)).toEqual([0, 2, 2, -0, -2, -2, 2, -3]);
  });

  it('builds the window once per flash and stores it gzipped', async () => {
    const t = NOW - 2 * MIN;
    const store = new MemoryStore();
    const summary = await builder(new FakeSource({
      goes19: [[t, [[35.0, -97.0, 3.0, 2e-14, 0], [35.0, -120.0, 4.0, 2e-14, 0], [2.0, -60.0, 5.0, 2e-14, 0]]]],
      goes18: [[t, [[35.0, -120.0, 4.1, 2e-14, 0], [35.0, -97.0, 3.1, 2e-14, 0]]]],
    }), store).run();
    const stored = store.objects.get(LATEST_KEY);
    expect(stored.body.slice(0, 2)).toEqual(new Uint8Array([0x1f, 0x8b]));
    expect(stored.contentType).toBe(LATEST_CONTENT_TYPE);
    const doc = await store.getJson(LATEST_KEY);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.count).toBe(2);
    expect(summary.flashes).toBe(2);
    expect(doc.flashes.lon).toEqual([-9700, -12000]);
    expect(doc.flashes.lat).toEqual([3500, 3500]);
    expect(doc.flashes.t.map((s) => doc.base + s)).toEqual([Math.round(t / 1000 + 3), Math.round(t / 1000 + 4.1)]);
    expect(doc.flashes.e).toEqual([20, 20]); // femtojoules
    expect(doc.sources.goes19.latest).toBe('2026-10-18T18:58:20Z');
    expect(summary.filesRead).toBe(2);
    expect(summary.sourceErrors).toBe(0);
  });

  it('reads each file once and ages flashes out', async () => {
    const old = NOW - 12 * MIN;
    const store = new MemoryStore();
    const src = new FakeSource({ goes19: [[old, [[35.0, -97.0, 1.0, 1e-14, 0]]]], goes18: [] });
    await builder(src, store).run();
    expect((await store.getJson(LATEST_KEY)).count).toBe(1);

    const newer = NOW + MIN;
    src.files.goes19.set(glmKey('goes19', newer), [newer, [[36.0, -96.0, 2.0, 1e-14, 0]]]);
    await builder(src, store, NOW + 90_000).run();
    expect(src.fetched.filter((k) => k === glmKey('goes19', old))).toHaveLength(1);
    expect((await store.getJson(LATEST_KEY)).count).toBe(2);

    await builder(src, store, NOW + 210_000).run();
    expect((await store.getJson(LATEST_KEY)).flashes.lat).toEqual([3600]); // the first flash is now over 15 minutes old
    expect(src.fetched).toHaveLength(2);
  });

  it('a cold start reads the newest files first', async () => {
    const times = [1, 2, 3, 4, 5].map((i) => NOW - 20_000 * i);
    const store = new MemoryStore();
    const src = new FakeSource({ goes19: times.map((t) => [t, [[35.0, -97.0, 1.0, 1e-14, 0]]]), goes18: [] });
    await builder(src, store, NOW, { maxFilesPerSatellite: 2 }).run();
    expect([...src.fetched].sort()).toEqual(times.slice(0, 2).map((t) => glmKey('goes19', t)).sort());
    await builder(src, store, NOW, { maxFilesPerSatellite: 2 }).run();
    expect(new Set(src.fetched).size).toBe(4);
    expect(src.fetched).toHaveLength(4);
  });

  it('satellites fail on their own and are retried next run', async () => {
    const t = NOW - MIN;
    const store = new MemoryStore();
    const log = vi.fn();
    const src = new FakeSource({
      goes19: [[t, [[35.0, -97.0, 1.0, 1e-14, 0]]]],
      goes18: [[t, [[35.0, -120.0, 1.0, 1e-14, 0]]]],
    }, { failList: ['goes18'], failFetch: [glmKey('goes19', t)] });
    const summary = await builder(src, store, NOW, { log }).run();
    const doc = await store.getJson(LATEST_KEY);
    expect(summary.sourceErrors).toBe(2);
    expect(doc.count).toBe(0);
    expect(doc.sources.goes18.error).toBe('listing failed');
    expect(log.mock.calls.map(([, msg]) => msg).sort()).toEqual(['lightning_file_failed', 'lightning_list_failed']);

    src.failList.clear();
    src.failFetch.clear();
    await builder(src, store).run();
    expect((await store.getJson(LATEST_KEY)).count).toBe(2);
  });

  it('a corrupt GLM file counts as a source error, not a failed run', async () => {
    const t = NOW - MIN;
    const store = new MemoryStore();
    const src = new FakeSource({ goes19: [[t, [[35.0, -97.0, 1.0, 1e-14, 0]]]], goes18: [] });
    src.fetchFile = async () => new TextEncoder().encode('<Error>NoSuchKey</Error>');
    const summary = await builder(src, store).run();
    expect(summary).toMatchObject({ sourceErrors: 1, filesRead: 0, flashes: 0 });
  });

  it('decode round trip, and bad state starts empty', async () => {
    const t = NOW - MIN;
    const store = new MemoryStore();
    await builder(new FakeSource({ goes19: [[t, [[35.25, -97.75, 1.0, 3e-14, 0]]]], goes18: [] }), store).run();
    const back = decodeFlashes(await store.getJson(LATEST_KEY));
    expect(Array.from(back.lat)).toEqual([35.25]);
    expect(Array.from(back.lon)).toEqual([-97.75]);
    expect(Math.abs(back.energy[0] - 3e-14) / 3e-14).toBeLessThan(0.05);
    expect(decodeFlashes({ schemaVersion: 99 }).t.length).toBe(0);
    expect(decodeFlashes(null).t.length).toBe(0);
    expect(decodeFlashes({ schemaVersion: 1, base: 1, flashes: { lon: [1], lat: [1, 2], t: [1], e: [1] } }).t.length).toBe(0);
  });

  it('a store failure fails the run', async () => {
    const store = new MemoryStore();
    store.put = async () => { throw new Error('Storage write failed: HTTP 500'); };
    await expect(builder(new FakeSource({ goes19: [], goes18: [] }), store).run()).rejects.toThrow(/Storage write failed/);
  });
});

describe('StorageStore', () => {
  const store = (fetchImpl) => new StorageStore({ url: 'https://p.supabase.co/', serviceKey: 'svc', fetchImpl });

  it('upserts the object with its type and cache lifetime, as the service role', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await store(fetchImpl).put('v1/latest.json.gz', new Uint8Array([1]), { contentType: 'application/gzip', cacheControl: 'max-age=30' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://p.supabase.co/storage/v1/object/lightning/v1/latest.json.gz');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer svc', apikey: 'svc', 'Content-Type': 'application/gzip', 'Cache-Control': 'max-age=30', 'x-upsert': 'true',
    });
  });

  it('reads gzipped state back; a missing object is null (404, or 400 not_found on older Storage)', async () => {
    const body = await gzip(new TextEncoder().encode('{"a":1}'));
    expect(await store(async () => new Response(body)).getJson('k')).toEqual({ a: 1 });
    expect(await store(async () => new Response('', { status: 404 })).getJson('k')).toBeNull();
    expect(await store(async () => new Response('{"statusCode":"404","error":"not_found"}', { status: 400 })).getJson('k')).toBeNull();
    await expect(store(async () => new Response('nope', { status: 500 })).getJson('k')).rejects.toThrow(/HTTP 500/);
    await expect(store(async () => new Response('nope', { status: 403 })).put('k', new Uint8Array(), {})).rejects.toThrow(/HTTP 403/);
  });
});
