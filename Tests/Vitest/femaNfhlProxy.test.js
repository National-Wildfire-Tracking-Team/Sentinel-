import { describe, it, expect, vi } from 'vitest';
import {
  CATEGORIES,
  MAX_TILES_PER_DATASET,
  MAX_UPSTREAM_CONCURRENCY,
  NFHL_SERVICE_URL,
  RateLimiter,
  RequestError,
  TileCache,
  UpstreamError,
  classifyZone,
  levelForZoom,
  mergeTiles,
  normalizeFeatures,
  parseQuery,
  resolveFloodHazards,
  tileBounds,
  tilesForBbox,
} from '../../cloud/fema-nfhl-proxy/nfhl.mjs';

const q = (params) => new URLSearchParams(params);

const square = (x, y, d = 0.001) => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]],
});

function zoneFeature(id, FLD_ZONE, ZONE_SUBTY = null, extra = {}) {
  return {
    type: 'Feature',
    geometry: square(-121.5, 38.57),
    properties: { OBJECTID: id, FLD_ZONE, ZONE_SUBTY, SFHA_TF: 'T', STATIC_BFE: -9999, DEPTH: -9999, DFIRM_ID: '06067C', ...extra },
  };
}

function panelFeature(id) {
  return {
    type: 'Feature',
    geometry: square(-121.6, 38.5, 0.2),
    properties: { OBJECTID: id, FIRM_PAN: '06067C0185H', PANEL_TYP: 'Countywide, Panel Printed', EFF_DATE: Date.UTC(2012, 7, 16), DFIRM_ID: '06067C' },
  };
}

function geojsonResponse(features, extra = {}) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ type: 'FeatureCollection', features, ...extra })),
  };
}

/** fetch mock that answers zones (layer 20), panels (1), availability (0) queries. */
function femaFetch({ zones = [], panels = [], availability = [] } = {}) {
  return vi.fn((url) => {
    if (url.includes('/20/query')) return Promise.resolve(geojsonResponse(zones));
    if (url.includes('/1/query')) return Promise.resolve(geojsonResponse(panels));
    if (url.includes('/0/query')) return Promise.resolve(geojsonResponse(availability));
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

function newCache(overrides = {}) {
  return new TileCache({ ttlMs: 1000, staleMs: 5000, maxEntries: 100, version: 'test', ...overrides });
}

// A ~2km box in Sacramento — a handful of tiles at every level.
const SMALL_BBOX = 'bbox=-121.50,38.57,-121.48,38.59';

describe('parseQuery — validation', () => {
  it('accepts a valid bbox and zoom', () => {
    expect(parseQuery(q('bbox=-121.5,38.5,-121.4,38.6&zoom=13'))).toEqual({
      bbox: { west: -121.5, south: 38.5, east: -121.4, north: 38.6 },
      zoom: 13,
    });
  });

  it.each([
    ['missing bbox', 'zoom=12'],
    ['missing zoom', 'bbox=-121.5,38.5,-121.4,38.6'],
    ['non-numeric bbox', 'bbox=a,b,c,d&zoom=12'],
    ['three values', 'bbox=-121.5,38.5,-121.4&zoom=12'],
    ['longitude out of range', 'bbox=-190,38.5,-121.4,38.6&zoom=12'],
    ['latitude out of range', 'bbox=-121.5,-89,-121.4,38.6&zoom=12'],
    ['inverted bbox', 'bbox=-121.4,38.5,-121.5,38.6&zoom=12'],
    ['zero-height bbox', 'bbox=-121.5,38.5,-121.4,38.5&zoom=12'],
    ['non-numeric zoom', 'bbox=-121.5,38.5,-121.4,38.6&zoom=abc'],
    ['zoom too high', 'bbox=-121.5,38.5,-121.4,38.6&zoom=30'],
  ])('rejects %s with a 400', (_label, query) => {
    expect(() => parseQuery(q(query))).toThrow(RequestError);
    try {
      parseQuery(q(query));
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it('rejects national-scale zooms below the minimum', () => {
    expect(() => parseQuery(q('bbox=-125,25,-66,49&zoom=4'))).toThrow(/zoom 7/);
  });
});

describe('levelForZoom', () => {
  it('maps map zoom to overview / detail / fine', () => {
    expect(levelForZoom(6.9)).toBeNull();
    expect(levelForZoom(7).name).toBe('overview');
    expect(levelForZoom(11.99).name).toBe('overview');
    expect(levelForZoom(12).name).toBe('detail');
    expect(levelForZoom(14).name).toBe('fine');
    expect(levelForZoom(18).name).toBe('fine');
  });
});

describe('tile grid', () => {
  it('round-trips a tile through its bounds', () => {
    const b = tileBounds(661, 1576, 12);
    const tiles = tilesForBbox({ west: b.west + 1e-6, south: b.south + 1e-6, east: b.east - 1e-6, north: b.north - 1e-6 }, 12);
    expect(tiles).toEqual([{ x: 661, y: 1576, z: 12 }]);
  });

  it('does not pull in a neighbour when a bbox ends exactly on a tile edge', () => {
    const b = tileBounds(661, 1576, 12);
    expect(tilesForBbox(b, 12)).toHaveLength(1);
  });

  it('returns every intersecting tile for a larger bbox', () => {
    const tiles = tilesForBbox({ west: -121.6, south: 38.5, east: -121.4, north: 38.7 }, 12);
    expect(tiles.length).toBeGreaterThan(4);
    expect(new Set(tiles.map((t) => `${t.x}/${t.y}`)).size).toBe(tiles.length);
  });
});

describe('classifyZone — FEMA categories', () => {
  it.each([
    ['AE', null, CATEGORIES.PCT_1],
    ['A', '', CATEGORIES.PCT_1],
    ['AO', 'RIVERINE FLOODPLAIN IN COASTAL AREA', CATEGORIES.PCT_1],
    ['AH', null, CATEGORIES.PCT_1],
    ['A99', 'AREA WITH REDUCED FLOOD HAZARD DUE TO LEVEE SYSTEM', CATEGORIES.PCT_1],
    ['AE', 'AREA WITH UNDETERMINED FLOOD HAZARD DUE TO NON-ACCREDITED LEVEE SYSTEM', CATEGORIES.PCT_1],
    ['VE', null, CATEGORIES.COASTAL_HIGH_HAZARD],
    ['V', 'COASTAL FLOODPLAIN', CATEGORIES.COASTAL_HIGH_HAZARD],
    ['AE', 'FLOODWAY', CATEGORIES.FLOODWAY],
    ['AE', 'COMMUNITY ENCROACHMENT AREA', CATEGORIES.FLOODWAY],
    ['VE', 'RIVERINE FLOODWAY SHOWN IN COASTAL ZONE', CATEGORIES.FLOODWAY],
    ['AE', 'COLORADO RIVER FLOODWAY', CATEGORIES.SPECIAL_FLOODWAY],
    ['AE', 'DENSITY FRINGE AREA', CATEGORIES.SPECIAL_FLOODWAY],
    ['X', '0.2 PCT ANNUAL CHANCE FLOOD HAZARD', CATEGORIES.PCT_0_2],
    ['X', '1 PCT DEPTH LESS THAN 1 FOOT', CATEGORIES.PCT_0_2],
    ['X', 'AREA WITH FLOOD HAZARD DUE TO NON-ACCREDITED LEVEE SYSTEM', CATEGORIES.PCT_0_2],
    ['X', '1 PCT FUTURE CONDITIONS', CATEGORIES.FUTURE_1PCT],
    ['X', '1 PCT FUTURE CONDITIONS, FLOODWAY', CATEGORIES.FUTURE_1PCT],
    ['X', 'AREA WITH REDUCED FLOOD RISK DUE TO LEVEE', CATEGORIES.LEVEE_REDUCED],
    ['X', 'AREA WITH REDUCED FLOOD HAZARD DUE TO ACCREDITED LEVEE SYSTEM', CATEGORIES.LEVEE_REDUCED],
    ['D', null, CATEGORIES.UNDETERMINED],
    ['D', 'AREA WITH FLOOD RISK DUE TO LEVEE', CATEGORIES.LEVEE_RISK],
    ['X', 'AREA OF MINIMAL FLOOD HAZARD', CATEGORIES.MINIMAL],
    ['X', null, CATEGORIES.MINIMAL],
    ['AREA NOT INCLUDED', null, CATEGORIES.NOT_INCLUDED],
  ])('%s / %s → %s', (zone, subtype, expected) => {
    expect(classifyZone(zone, subtype)).toBe(expected);
  });
});

describe('normalizeFeatures', () => {
  it('translates FEMA fields, drops -9999 sentinels and null properties', () => {
    const [f] = normalizeFeatures('zones', [zoneFeature(7, 'AE', null, { STATIC_BFE: 23.5, LEN_UNIT: 'Feet', V_DATUM: 'NAVD88' })]);
    expect(f.properties).toEqual({
      id: 7,
      zone: 'AE',
      category: 'pct_1',
      sfha: true,
      bfe: 23.5,
      lengthUnit: 'Feet',
      verticalDatum: 'NAVD88',
      dfirmId: '06067C',
    });
    expect(f.properties).not.toHaveProperty('FLD_ZONE');
  });

  it('drops unshaded Zone X and features with no geometry', () => {
    const out = normalizeFeatures('zones', [
      zoneFeature(1, 'X', 'AREA OF MINIMAL FLOOD HAZARD'),
      { ...zoneFeature(2, 'AE'), geometry: null },
      zoneFeature(3, 'AE'),
    ]);
    expect(out.map((f) => f.id)).toEqual([3]);
  });

  it('normalizes FIRM panels with an ISO effective date', () => {
    const [p] = normalizeFeatures('panels', [panelFeature(9)]);
    expect(p.properties).toMatchObject({ panel: '06067C0185H', effectiveDate: '2012-08-16', panelType: 'Countywide, Panel Printed' });
    expect(p.properties).not.toHaveProperty('unmapped');
  });
});

describe('mergeTiles', () => {
  it('de-duplicates a polygon returned by several tiles but keeps distinct overlapping zones', () => {
    const [a, b] = normalizeFeatures('zones', [zoneFeature(1, 'AE'), zoneFeature(2, 'AE', 'FLOODWAY')]);
    const merged = mergeTiles([[a, b], [a], [b]]);
    expect(merged.features.map((f) => f.properties.category)).toEqual(['pct_1', 'floodway']);
  });
});

describe('TileCache', () => {
  it('misses, then hits without calling the loader again', async () => {
    const cache = newCache();
    const loader = vi.fn().mockResolvedValue({ features: [] });
    expect((await cache.get('k', loader)).status).toBe('miss');
    expect((await cache.get('k', loader)).status).toBe('hit');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent misses for the same key onto one upstream fetch', async () => {
    const cache = newCache();
    const loader = vi.fn(() => new Promise((r) => setTimeout(() => r({ features: [] }), 5)));
    await Promise.all([cache.get('k', loader), cache.get('k', loader), cache.get('k', loader)]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL and falls back to the stale entry if FEMA fails', async () => {
    let t = 0;
    const cache = newCache({ now: () => t });
    await cache.get('k', () => Promise.resolve({ features: ['old'] }));
    t = 2000; // past ttl (1000), inside stale window (5000)
    const res = await cache.get('k', () => Promise.reject(new UpstreamError('down')));
    expect(res).toEqual({ value: { features: ['old'] }, status: 'stale' });
  });

  it('rethrows once the stale window has passed', async () => {
    let t = 0;
    const cache = newCache({ now: () => t });
    await cache.get('k', () => Promise.resolve({ features: [] }));
    t = 10000;
    await expect(cache.get('k', () => Promise.reject(new UpstreamError('down')))).rejects.toThrow('down');
  });

  it('evicts least-recently-used entries past maxEntries', async () => {
    const cache = newCache({ maxEntries: 2 });
    const load = () => Promise.resolve({ features: [] });
    await cache.get('a', load);
    await cache.get('b', load);
    await cache.get('a', load); // touch a
    await cache.get('c', load); // evicts b
    expect([...cache.entries.keys()]).toEqual(['a', 'c']);
  });

  it('includes the version in keys so bumping it invalidates everything', () => {
    const tile = { x: 1, y: 2, z: 12 };
    expect(newCache({ version: 'v1' }).key('zones', tile)).toBe('nfhl:v1:zones:12/1/2');
    expect(newCache({ version: 'v2' }).key('zones', tile)).not.toBe(newCache({ version: 'v1' }).key('zones', tile));
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit per window, then resets', () => {
    let t = 0;
    const rl = new RateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('a')).toBe(true);
    expect(rl.allow('a')).toBe(false);
    expect(rl.allow('b')).toBe(true);
    t = 1000;
    expect(rl.allow('a')).toBe(true);
  });
});

describe('resolveFloodHazards', () => {
  it('fetches zones + panels at detail zoom from the NFHL service only', async () => {
    const fetchImpl = femaFetch({ zones: [zoneFeature(1, 'AE'), zoneFeature(2, 'X', '0.2 PCT ANNUAL CHANCE FLOOD HAZARD')], panels: [panelFeature(5)] });
    const { body, stats } = await resolveFloodHazards(parseQuery(q(`${SMALL_BBOX}&zoom=13`)), { cache: newCache(), fetchImpl });

    expect(body.level).toBe('detail');
    expect(body.zones.features.map((f) => f.properties.category)).toEqual(['pct_1', 'pct_0_2']);
    expect(body.panels.features).toHaveLength(1);
    expect(body.availability.features).toHaveLength(0);
    expect(body.attribution).toMatch(/FEMA National Flood Hazard Layer/);
    expect(stats.misses).toBe(stats.tiles);
    for (const [url] of fetchImpl.mock.calls) expect(url.startsWith(NFHL_SERVICE_URL)).toBe(true);
    expect(fetchImpl.mock.calls.every(([url]) => !url.includes('/0/query'))).toBe(true);
  });

  it('serves only generalized availability polygons at overview zoom', async () => {
    const fetchImpl = femaFetch({ availability: [{ type: 'Feature', geometry: square(-122, 38, 1), properties: { OBJECTID: 1, STUDY_ID: '06067C' } }] });
    const { body } = await resolveFloodHazards(parseQuery(q('bbox=-122,38,-121,39&zoom=9')), { cache: newCache(), fetchImpl });
    expect(body.level).toBe('overview');
    expect(body.availability.features).toHaveLength(1);
    expect(body.zones.features).toHaveLength(0);
    expect(fetchImpl.mock.calls.every(([url]) => url.includes('/0/query'))).toBe(true);
  });

  it('answers a repeated request entirely from cache', async () => {
    const cache = newCache();
    const fetchImpl = femaFetch({ zones: [zoneFeature(1, 'AE')] });
    const query = parseQuery(q(`${SMALL_BBOX}&zoom=13`));
    await resolveFloodHazards(query, { cache, fetchImpl });
    const calls = fetchImpl.mock.calls.length;

    const { stats } = await resolveFloodHazards(query, { cache, fetchImpl });
    expect(fetchImpl.mock.calls.length).toBe(calls);
    expect(stats.hits).toBe(stats.tiles);
    expect(stats.upstreamRequests).toBe(0);
  });

  it('only fetches the newly exposed tiles after a pan', async () => {
    const cache = newCache();
    const fetchImpl = femaFetch();
    await resolveFloodHazards(parseQuery(q('bbox=-121.60,38.55,-121.50,38.60&zoom=13')), { cache, fetchImpl });
    const { stats } = await resolveFloodHazards(parseQuery(q('bbox=-121.55,38.55,-121.45,38.60&zoom=13')), { cache, fetchImpl });
    expect(stats.hits).toBeGreaterThan(0);
    expect(stats.misses).toBeGreaterThan(0);
  });

  it('returns empty collections for an area with no NFHL data', async () => {
    const { body } = await resolveFloodHazards(parseQuery(q(`${SMALL_BBOX}&zoom=13`)), { cache: newCache(), fetchImpl: femaFetch() });
    expect(body.zones.features).toEqual([]);
    expect(body.panels.features).toEqual([]);
  });

  it('rejects an oversized area with 413 before calling FEMA', async () => {
    const fetchImpl = femaFetch();
    const query = parseQuery(q('bbox=-123,37,-120,40&zoom=12'));
    await expect(resolveFloodHazards(query, { cache: newCache(), fetchImpl })).rejects.toMatchObject({ status: 413 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(MAX_TILES_PER_DATASET).toBeLessThanOrEqual(64);
  });

  it('surfaces a sustained FEMA outage as UpstreamError after retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('') });
    await expect(resolveFloodHazards(parseQuery(q(`${SMALL_BBOX}&zoom=13`)), { cache: newCache(), fetchImpl, retryDelaysMs: [0, 0] }))
      .rejects.toBeInstanceOf(UpstreamError);
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(3); // original + 2 retries
  });

  it('retries a connection reset and succeeds', async () => {
    const zones = femaFetch({ zones: [zoneFeature(1, 'AE')] });
    let first = true;
    const fetchImpl = vi.fn((url, opts) => {
      if (first) {
        first = false;
        return Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }));
      }
      return zones(url, opts);
    });
    const { body } = await resolveFloodHazards(parseQuery(q('bbox=-121.495,38.575,-121.494,38.576&zoom=13')), { cache: newCache(), fetchImpl, retryDelaysMs: [0, 0] });
    expect(body.zones.features).toHaveLength(1);
  });

  it('never has more than MAX_UPSTREAM_CONCURRENCY FEMA requests in flight', async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return geojsonResponse([]);
    });
    await resolveFloodHazards(parseQuery(q('bbox=-121.60,38.50,-121.40,38.65&zoom=13')), { cache: newCache(), fetchImpl });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(MAX_UPSTREAM_CONCURRENCY);
    expect(peak).toBeLessThanOrEqual(MAX_UPSTREAM_CONCURRENCY);
  });

  it('treats an ArcGIS error payload as an upstream failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(JSON.stringify({ error: { code: 500, message: 'boom' } })) });
    await expect(resolveFloodHazards(parseQuery(q(`${SMALL_BBOX}&zoom=13`)), { cache: newCache(), fetchImpl, retryDelaysMs: [0, 0] }))
      .rejects.toBeInstanceOf(UpstreamError);
  });

  it('pages past the 2000-record limit and flags truncation at the page cap', async () => {
    const fetchImpl = vi.fn((url) => {
      if (url.includes('/20/query')) return Promise.resolve(geojsonResponse([zoneFeature(Math.random(), 'AE')], { exceededTransferLimit: true }));
      return Promise.resolve(geojsonResponse([]));
    });
    const { body } = await resolveFloodHazards(parseQuery(q('bbox=-121.495,38.575,-121.494,38.576&zoom=13')), { cache: newCache(), fetchImpl });
    const zoneCalls = fetchImpl.mock.calls.filter(([url]) => url.includes('/20/query'));
    expect(zoneCalls.length).toBe(4);
    expect(zoneCalls[1][0]).toContain('resultOffset=2000');
    expect(body.truncated).toBe(true);
  });
});
