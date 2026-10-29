import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler, {
  FIELDS, INDUSTRIAL_SITES as SITES, KANARI_EVENTS_URL, config, fetchGlobalFires, isInUnitedStates, isOnIndustrialSite,
} from '../../netlify/functions/kanari-fires/kanari-fires.mjs';
import {
  KANARI_SOURCE, fetchGlobalFires as fetchGlobalFiresClient, isKanariFire, kanariFireName, kanariRowToFeature,
  satelliteSourceLabel,
} from '../../src/app/api/kanariFires';
import { clearCache } from '../../src/app/utils/dataCache';
import { isOverOpenWater } from '../../netlify/functions/kanari-fires/water.mjs';

const event = (id, lon, lat, extra = {}) => ({
  id,
  centroid: [lon, lat],
  bbox: [lon, lat, lon, lat],
  count: 3,
  viirsCount: 2,
  goesCount: 1,
  mtgCount: 0,
  firstSeen: '2026-10-27T10:00:00Z',
  lastSeen: '2026-10-27T18:00:00Z',
  maxFrp: 42.5,
  maxConf: 'n',
  confidence: 'probable',
  ...extra,
});

const kanari = (events, meta = {}) => vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ events, meta: { fetchedAt: '2026-10-27T18:01:00Z', ...meta } }),
}));

describe('isInUnitedStates', () => {
  it.each([
    ['Los Angeles', [-118.24, 34.05], true],
    ['Anchorage', [-149.9, 61.2], true],
    ['Honolulu', [-157.86, 21.31], true],
    ['Detroit', [-83.05, 42.33], true],
    ['Windsor, ON', [-83.02, 42.3], false],
    ['Vancouver', [-123.12, 49.28], false],
    ['Tijuana', [-117.04, 32.51], false],
    ['Sydney', [151.2, -33.87], false],
  ])('%s', (_, point, expected) => {
    expect(isInUnitedStates(point)).toBe(expected);
  });
});

describe('isOverOpenWater', () => {
  it.each([
    ['the mid-Atlantic', [-40, 30], true],
    ['the middle of the Persian Gulf', [51.5, 27.2], true],
    ['the North Sea oil fields', [3.2, 56.5], true],
    ['the middle of Lake Superior', [-87.5, 47.6], true],
    ['Paris', [2.35, 48.85], false],
    ['the Sydney coast', [151.28, -33.89], false],
    ['tiny Tristan da Cunha', [-12.3, -37.1], false],
    ['Bahrain', [50.55, 26.07], false],
  ])('%s', (_, [lon, lat], expected) => {
    expect(isOverOpenWater(lon, lat)).toBe(expected);
  });
});

describe('isOnIndustrialSite', () => {
  // A site with no other site within 10 km, so distances are unambiguous.
  const km = (a, b) => Math.hypot((a[1] - b[1]) * 111.32 * Math.cos(a[0] * Math.PI / 180), (a[0] - b[0]) * 111.32);
  const lone = SITES.find((s) => Math.abs(s[0]) < 50 && SITES.every((o) => o === s || km(s, o) > 10));
  const [lat, lon] = lone;
  const north = (d) => lat + d / 111.32; // d km due north

  it('matches a cluster on the site', () => {
    expect(isOnIndustrialSite(lon, lat)).toBe(true);
  });

  it('allows 1 km for VIIRS-seen clusters and 3 km for geostationary-only ones', () => {
    expect(isOnIndustrialSite(lon, north(0.8))).toBe(true);
    expect(isOnIndustrialSite(lon, north(2))).toBe(false);
    expect(isOnIndustrialSite(lon, north(2), { geostationaryOnly: true })).toBe(true);
    expect(isOnIndustrialSite(lon, north(4), { geostationaryOnly: true })).toBe(false);
  });

  it('decodes the packed site list', () => {
    expect(SITES.length).toBeGreaterThan(30000);
    expect(SITES.every(([lat, lon]) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180)).toBe(true);
  });

  it('has no US sites (US clusters are dropped anyway)', () => {
    expect(SITES.some(([sLat, sLon]) => isInUnitedStates([sLon, sLat]))).toBe(false);
  });
});

describe('kanari-fires function', () => {
  it('requests the full 24 h set once and drops US clusters', async () => {
    const fetchImpl = kanari([event('ca', -120, 55), event('us', -118.24, 34.05), event('au', 151.2, -33.87)]);
    const body = await fetchGlobalFires({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(KANARI_EVENTS_URL);
    expect(KANARI_EVENTS_URL).toContain('full=1');
    expect(body.fields).toEqual(FIELDS);
    expect(body.fires.map((r) => r[0])).toEqual(['ca', 'au']);
    const minutes = (iso) => Date.parse(iso) / 60000;
    expect(body.fires[0]).toEqual([
      'ca', -120, 55, 3, 2, 1, 0, minutes('2026-10-27T10:00:00Z'), minutes('2026-10-27T18:00:00Z'), 42.5, 'probable',
    ]);
    expect(body.meta).toMatchObject({ source: 'kanari.io', truncated: false });
  });

  it('drops clusters on industrial sites and counts them', async () => {
    const [lat, lon] = SITES.find(([sLat, sLon]) => !isOverOpenWater(sLon, sLat)); // onshore, so the water check can't take it first
    const body = await fetchGlobalFires({ fetchImpl: kanari([event('flare', lon, lat), event('fire', 151.2, -33.87)]) });
    expect(body.fires.map((r) => r[0])).toEqual(['fire']);
    expect(body.meta.industrialSitesDropped).toBe(1);
  });

  it('drops clusters out over open water and counts them', async () => {
    const body = await fetchGlobalFires({ fetchImpl: kanari([event('sea', -40, 30), event('fire', 151.2, -33.87)]) });
    expect(body.fires.map((r) => r[0])).toEqual(['fire']);
    expect(body.meta.openWaterDropped).toBe(1);
  });

  it('skips clusters without a usable centroid', async () => {
    const body = await fetchGlobalFires({ fetchImpl: kanari([event('bad', null, 5), { id: 'none' }]) });
    expect(body.fires).toEqual([]);
  });

  it('throws on an upstream error', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(fetchGlobalFires({ fetchImpl })).rejects.toThrow('503');
  });

  describe('handler', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    it('caches successes durably on the CDN for longer than a minute', async () => {
      global.fetch = kanari([event('ca', -120, 55)]);
      const res = await handler(new Request('https://x.test/api/kanari/fires'));
      expect(res.status).toBe(200);
      const cdn = res.headers.get('Netlify-CDN-Cache-Control');
      expect(cdn).toContain('durable');
      expect(Number(cdn.match(/s-maxage=(\d+)/)[1])).toBeGreaterThanOrEqual(60);
      expect((await res.json()).fires).toHaveLength(1);
    });

    it('answers a matching If-None-Match with a bodiless 304', async () => {
      global.fetch = kanari([event('ca', -120, 55)]);
      const first = await handler(new Request('https://x.test/api/kanari/fires'));
      const etag = first.headers.get('ETag');
      expect(etag).toBeTruthy();
      global.fetch = kanari([event('ca', -120, 55)]);
      const again = await handler(new Request('https://x.test/api/kanari/fires', { headers: { 'If-None-Match': etag } }));
      expect(again.status).toBe(304);
      expect(await again.text()).toBe('');
    });

    it('never caches a failure, and hides the upstream detail', async () => {
      global.fetch = vi.fn(async () => { throw new Error('socket hang up'); });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await handler(new Request('https://x.test/api/kanari/fires'));
      expect(res.status).toBe(502);
      expect(res.headers.get('Netlify-CDN-Cache-Control')).toBe('no-store');
      expect(await res.text()).not.toContain('socket hang up');
    });

    it('is routed at /api/kanari/fires', () => {
      expect(config.path).toBe('/api/kanari/fires');
    });
  });
});

describe('kanariFires client', () => {
  const originalFetch = global.fetch;
  beforeEach(() => clearCache());
  afterEach(() => { global.fetch = originalFetch; });

  it('names a cluster by its coordinates', () => {
    expect(kanariFireName(-117.4512, 51.2349)).toBe('Satellite fire 51.23°N 117.45°W');
    expect(kanariFireName(151.2, -33.87)).toBe('Satellite fire 33.87°S 151.20°E');
  });

  it('credits the satellites that saw the fire, not kanari.io', () => {
    expect(satelliteSourceLabel({ goesCount: 2, viirsCount: 0, mtgCount: 0 })).toBe('GOES satellites');
    expect(satelliteSourceLabel({ goesCount: 0, viirsCount: 1, mtgCount: 4 })).toBe('VIIRS + Meteosat MTG satellites');
    expect(satelliteSourceLabel({ goesCount: 0, viirsCount: 0, mtgCount: 0 })).toBe('Satellite');
  });

  it('turns a row into an incident dot with unknown size and containment', () => {
    const row = ['abc', -120, 55, 3, 2, 1, 0, Date.parse('2026-10-27T10:00:00Z') / 60000, Date.parse('2026-10-27T18:00:00Z') / 60000, 42.5, 'probable'];
    const f = kanariRowToFeature(row, FIELDS);
    expect(f.geometry.coordinates).toEqual([-120, 55]);
    expect(f.properties).toMatchObject({
      UniqueFireIdentifier: 'KANARI-abc',
      IncidentName: 'Satellite fire 55.00°N 120.00°W',
      GISAcres: null,
      PercentContained: null,
      FireDiscoveryDateTime: '2026-10-27T10:00:00.000Z',
      ModifiedOnDateTime: '2026-10-27T18:00:00.000Z',
      _source: KANARI_SOURCE,
      _satellites: 'GOES + VIIRS satellites',
      _detections: 3,
      _sensors: 'VIIRS 2 · GOES 1',
      _maxFrp: 42.5,
      _confidence: 'probable',
    });
    expect(isKanariFire(f.properties)).toBe(true);
    expect(isKanariFire({ _source: 'CAL_FIRE' })).toBe(false);
  });

  it('fetches once for concurrent callers and returns empty when the route fails', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ fields: FIELDS, fires: [['a', 10, 10, 1, 1, 0, 0, null, null, 1, 'possible']] }),
    }));
    const [a, b] = await Promise.all([fetchGlobalFiresClient(), fetchGlobalFiresClient()]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a.features).toHaveLength(1);

    clearCache();
    global.fetch = vi.fn(async () => ({ ok: false, status: 502, json: async () => ({ error: 'down' }) }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await fetchGlobalFiresClient()).features).toEqual([]);
  });
});
