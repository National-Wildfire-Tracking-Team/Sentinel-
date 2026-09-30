/**
 * nwsMapServerAlerts.test.js
 * Unit tests for the ID-first WWA MapServer supplement
 * (src/app/api/nwsMapServerAlerts.js).
 *
 * The contract under test: geometry is only downloaded for cap_ids that
 * api.weather.gov didn't already supply, and any failure of the ID-first
 * path falls back to the original full-layer query rather than dropping
 * alerts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ID_BATCH_SIZE,
  MAPSERVER_LAYERS,
  fetchMapServerSupplement,
  fullLayerUrl,
  geometryQueryUrl,
  idQueryUrl,
  parseIdResponse,
} from '../../src/app/api/nwsMapServerAlerts';

const capId = (n) => `urn:oid:2.49.0.1.840.0.${String(n).padStart(40, '0')}.001.1`;

const idResponse = (ids) => ({
  displayFieldName: 'cap_id',
  features: ids.map((id) => ({ attributes: { cap_id: id } })),
});

const feature = (id, sig = 'W') => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[-120, 37], [-119, 37], [-119, 38], [-120, 37]]] },
  properties: { prod_type: 'Flood Warning', sig, cap_id: id, issuance: 'x', expiration: 'y' },
});

const featureCollection = (ids) => ({ type: 'FeatureCollection', features: ids.map((id) => feature(id)) });

/** Pull the cap_ids back out of a geometry query's where clause. */
function idsInWhere(url) {
  const where = new URL(url, 'https://app.test').searchParams.get('where');
  return [...where.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const layerOf = (url) => Number(url.match(/\/api\/nws\/wwa\/(\d+)\/query/)[1]);
const isIdQuery = (url) => url.includes('returnDistinctValues=true');
const isFullQuery = (url) => url.includes('where=1%3D1') && !isIdQuery(url);

function json(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

/**
 * Route fetches by query type. `layers[id]` supplies, per layer:
 *   ids       – cap_ids the id query returns (or `idBody` for a raw body)
 *   idFail    – make the id query reject
 *   geomFail  – make geometry batches fail
 *   full      – feature ids the full query returns
 */
function mockUpstream(layers) {
  const fetchMock = vi.fn((url) => {
    const cfg = layers[layerOf(url)] || {};
    if (isIdQuery(url)) {
      if (cfg.idFail) return Promise.reject(new Error('network down'));
      return json(cfg.idBody ?? idResponse(cfg.ids ?? []));
    }
    if (isFullQuery(url)) return json(featureCollection(cfg.full ?? []));
    if (cfg.geomFail) return json({ error: { code: 500 } }, false, 500);
    return json(featureCollection(idsInWhere(url)));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const urls = (fetchMock) => fetchMock.mock.calls.map(([u]) => u);

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('query URLs', () => {
  it('keeps the full-layer fallback URL identical to the pre-ID-first query', () => {
    expect(fullLayerUrl(1)).toBe(
      '/api/nws/wwa/1/query?where=1%3D1&outFields=prod_type,sig,cap_id,issuance,expiration&outSR=4326&f=geojson',
    );
  });

  it('asks for distinct cap_ids only, with no geometry', () => {
    const params = new URL(idQueryUrl(1), 'https://app.test').searchParams;
    expect(params.get('outFields')).toBe('cap_id');
    expect(params.get('returnGeometry')).toBe('false');
    expect(params.get('returnDistinctValues')).toBe('true');
    expect(params.get('f')).toBe('json');
  });

  it('requests geometry with the existing fields for just the given ids', () => {
    const url = geometryQueryUrl(1, [capId(1), capId(2)]);
    const params = new URL(url, 'https://app.test').searchParams;
    expect(params.get('where')).toBe(`cap_id IN ('${capId(1)}','${capId(2)}')`);
    expect(params.get('outFields')).toBe('prod_type,sig,cap_id,issuance,expiration');
    expect(params.get('outSR')).toBe('4326');
    expect(params.get('f')).toBe('geojson');
  });
});

describe('parseIdResponse', () => {
  it('returns the cap_ids from a well-formed response', () => {
    expect(parseIdResponse(idResponse([capId(1), capId(2)]))).toEqual([capId(1), capId(2)]);
  });

  it('skips rows with no cap_id, which were always dropped downstream', () => {
    const body = { features: [{ attributes: { cap_id: null } }, { attributes: { cap_id: capId(3) } }] };
    expect(parseIdResponse(body)).toEqual([capId(3)]);
  });

  it.each([
    ['null body', null],
    ['ArcGIS error payload', { error: { code: 400, message: 'bad' } }],
    ['missing features', { fields: [] }],
    ['truncated list', { ...idResponse([capId(1)]), exceededTransferLimit: true }],
    ['non-string cap_id', { features: [{ attributes: { cap_id: 42 } }] }],
    ['cap_id that cannot be safely quoted', { features: [{ attributes: { cap_id: "x') OR (1=1" } }] }],
  ])('rejects %s', (_name, body) => {
    expect(parseIdResponse(body)).toBeNull();
  });
});

describe('fetchMapServerSupplement', () => {
  it('downloads no geometry when every MapServer id is already loaded', async () => {
    const fetchMock = mockUpstream({ 0: { ids: [capId(1)] }, 1: { ids: [capId(2), capId(3)] } });

    const { alerts, stats } = await fetchMapServerSupplement(new Set([capId(1), capId(2), capId(3)]));

    expect(alerts).toEqual([]);
    expect(urls(fetchMock).every(isIdQuery)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(MAPSERVER_LAYERS.length);
    expect(stats).toMatchObject({ mode: 'id-first', mapServerIds: 3, missingIds: 0, geometryRequests: 0 });
  });

  it('fetches geometry only for the ids api.weather.gov is missing', async () => {
    const fetchMock = mockUpstream({ 0: { ids: [capId(1)] }, 1: { ids: [capId(2), capId(3), capId(4)] } });

    const { alerts, stats } = await fetchMapServerSupplement(new Set([capId(1), capId(2)]));

    const geomUrls = urls(fetchMock).filter((u) => !isIdQuery(u));
    expect(geomUrls).toHaveLength(1);
    expect(layerOf(geomUrls[0])).toBe(1);
    expect(idsInWhere(geomUrls[0])).toEqual([capId(3), capId(4)]);
    expect(urls(fetchMock).some(isFullQuery)).toBe(false);
    expect(alerts.map((a) => a.id)).toEqual([capId(3), capId(4)]);
    expect(stats).toMatchObject({ mode: 'id-first', missingIds: 2, geometryRequests: 1 });
  });

  it('normalizes supplemental alerts exactly as the hook always did', async () => {
    mockUpstream({ 1: { ids: [capId(5)] } });

    const { alerts } = await fetchMapServerSupplement(new Set());

    expect(alerts[0]).toEqual({
      id: capId(5),
      type: 'Flood Warning',
      severity: 'Extreme',
      urgency: 'Immediate',
      geometry: feature(capId(5)).geometry,
      geocode: null,
      source: 'NWS',
    });
  });

  it('fetches geometry for every id when none are loaded', async () => {
    const all = [capId(1), capId(2), capId(3)];
    const fetchMock = mockUpstream({ 1: { ids: all } });

    const { alerts } = await fetchMapServerSupplement(new Set());

    const geomUrls = urls(fetchMock).filter((u) => !isIdQuery(u) && layerOf(u) === 1);
    expect(geomUrls.flatMap(idsInWhere)).toEqual(all);
    expect(alerts.map((a) => a.id)).toEqual(all);
  });

  it('returns nothing and fetches no geometry for an empty MapServer layer', async () => {
    const fetchMock = mockUpstream({ 0: { ids: [] }, 1: { ids: [] } });

    const { alerts, stats } = await fetchMapServerSupplement(new Set([capId(1)]));

    expect(alerts).toEqual([]);
    expect(urls(fetchMock).every(isIdQuery)).toBe(true);
    expect(stats.mode).toBe('id-first');
  });

  it('splits many missing ids into batches of ID_BATCH_SIZE', async () => {
    const missing = Array.from({ length: ID_BATCH_SIZE * 2 + 7 }, (_, i) => capId(i + 1));
    const fetchMock = mockUpstream({ 1: { ids: missing } });

    const { alerts, stats } = await fetchMapServerSupplement(new Set());

    const batches = urls(fetchMock).filter((u) => !isIdQuery(u) && layerOf(u) === 1).map(idsInWhere);
    expect(batches.map((b) => b.length)).toEqual([ID_BATCH_SIZE, ID_BATCH_SIZE, 7]);
    expect(batches.flat()).toEqual(missing);
    expect(alerts).toHaveLength(missing.length);
    expect(stats.geometryRequests).toBe(3);
  });

  it('keeps every segment row of a multi-zone missing alert', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (isIdQuery(url)) return json(idResponse(layerOf(url) === 1 ? [capId(9)] : []));
      return json({ type: 'FeatureCollection', features: [feature(capId(9)), feature(capId(9))] });
    }));

    const { alerts } = await fetchMapServerSupplement(new Set());

    expect(alerts.map((a) => a.id)).toEqual([capId(9), capId(9)]);
  });

  it('falls back to the full query when the id query fails', async () => {
    const fetchMock = mockUpstream({ 0: { ids: [] }, 1: { idFail: true, full: [capId(1), capId(2)] } });

    const { alerts, stats } = await fetchMapServerSupplement(new Set([capId(1)]));

    expect(urls(fetchMock).filter(isFullQuery).map(layerOf)).toEqual([1]);
    // The fallback returns the whole layer; the hook's existing de-dup
    // filter removes capId(1) exactly as it did before this change.
    expect(alerts.map((a) => a.id)).toEqual([capId(1), capId(2)]);
    expect(stats).toMatchObject({ mode: 'fallback', fallbackLayers: [1] });
  });

  it('falls back to the full query when the id response is malformed', async () => {
    const fetchMock = mockUpstream({
      0: { ids: [] },
      1: { idBody: { error: { code: 500, message: 'Unable to complete operation.' } }, full: [capId(7)] },
    });

    const { alerts, stats } = await fetchMapServerSupplement(new Set());

    expect(urls(fetchMock).some(isFullQuery)).toBe(true);
    expect(alerts.map((a) => a.id)).toEqual([capId(7)]);
    expect(stats.fallbackLayers).toEqual([1]);
  });

  it('falls back to the full query when a geometry batch fails', async () => {
    const fetchMock = mockUpstream({ 0: { ids: [] }, 1: { ids: [capId(3)], geomFail: true, full: [capId(3)] } });

    const { alerts, stats } = await fetchMapServerSupplement(new Set());

    expect(urls(fetchMock).filter(isFullQuery).map(layerOf)).toEqual([1]);
    expect(alerts.map((a) => a.id)).toEqual([capId(3)]);
    expect(stats.fallbackLayers).toEqual([1]);
  });

  it('falls back to the full query for every layer without a usable id set', async () => {
    const fetchMock = mockUpstream({ 0: { full: [capId(1)] }, 1: { full: [capId(2)] } });

    const { alerts, stats } = await fetchMapServerSupplement(undefined);

    expect(urls(fetchMock).every(isFullQuery)).toBe(true);
    expect(alerts.map((a) => a.id).sort()).toEqual([capId(1), capId(2)]);
    expect(stats.mode).toBe('fallback');
  });

  it('returns no alerts, without throwing, when the fallback also fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    const { alerts, stats } = await fetchMapServerSupplement(new Set());

    expect(alerts).toEqual([]);
    expect(stats.mode).toBe('fallback');
  });
});
