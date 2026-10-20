/**
 * fireDangerSources.test.js
 * Parsing, classification, freshness, caching and proxy wiring for the
 * Fire Danger & Fuels sources (src/app/api/fireDanger/*).
 *
 * fixtures/nwcgSfpDay1.json is four Predictive Service Areas taken from the
 * live NWCG 7-day service on 2026-10-20 (geometry thinned, attributes as
 * published). The trigger values CRITICAL / IGNITION didn't occur that day,
 * so those cases use hand-built attributes.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SFP_CLASSES, classifySfp, normalizeSfp, summarizeSfp, sfpQueryUrl, sfpForecastDate, fetchSignificantFirePotential,
} from '../../src/app/api/fireDanger/significantFirePotential';
import { productDate, sfpFreshness } from '../../src/app/api/fireDanger/freshness';
import { sfpStatus, formatForecastDate } from '../../src/app/api/fireDanger/status';
import {
  FBFM40, describeFuelModel, fuelLegendGroups, landfireServicesFor, landfireTileUrl, fetchFuelModelAt, LANDFIRE_FBFM40_SERVICES,
} from '../../src/app/api/fireDanger/landfireFuels';
import { fetchJson } from '../../src/app/api/fireDanger/fetchJson';
import { clearCache } from '../../src/app/utils/dataCache';
import { ALLOWED_PARAMS } from '../../netlify/edge-functions/_shared/edgeProxy.js';
import { ROUTES as ARCGIS_ROUTES, LANDFIRE_SERVICES } from '../../netlify/edge-functions/arcgis-proxy.js';

const FIXTURE = JSON.parse(readFileSync(resolve(process.cwd(), 'Tests/Vitest/fixtures/nwcgSfpDay1.json'), 'utf8'));

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

beforeEach(() => clearCache());
afterEach(() => vi.restoreAllMocks());

describe('NWCG significant fire potential: classification', () => {
  it('maps issued dryness codes to NIFC legend classes', () => {
    expect(classifySfp({ isvalid: 1, drynesscode: 0, type: null })).toBe('nodata');
    expect(classifySfp({ isvalid: 1, drynesscode: 1, type: null })).toBe('little');
    expect(classifySfp({ isvalid: 1, drynesscode: 2, type: null })).toBe('low');
    expect(classifySfp({ isvalid: 1, drynesscode: 3, type: null })).toBe('moderate');
  });

  it('lets a high-risk trigger override dryness, orange vs red as on NIFC\'s map', () => {
    expect(classifySfp({ isvalid: 1, drynesscode: 2, type: 'CRITICAL' })).toBe('highOrange');
    expect(classifySfp({ isvalid: 1, drynesscode: 1, type: 'IGNITION' })).toBe('highRed');
    expect(SFP_CLASSES.highOrange.color).toBe('#ff8c00');
    expect(SFP_CLASSES.highRed.color).toBe('#ff0000');
  });

  it('never rates an area whose forecast is not issued, or an unknown code', () => {
    expect(classifySfp({ isvalid: 0, drynesscode: 3, type: 'IGNITION' })).toBeNull();
    expect(classifySfp({ drynesscode: 2 })).toBeNull();
    expect(classifySfp({ isvalid: 1, drynesscode: 7 })).toBeNull();
  });

  it('keeps the legend in rank order', () => {
    const ranks = Object.values(SFP_CLASSES).map((c) => c.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe('NWCG significant fire potential: parsing the live response', () => {
  const fc = normalizeSfp(FIXTURE, 1);

  it('classifies each area from its published attributes', () => {
    const byPsa = Object.fromEntries(fc.features.map((f) => [f.properties.psa, f.properties]));
    expect(byPsa.SA46.sfpClass).toBe('low');
    expect(byPsa.SA21C.sfpClass).toBe('moderate');
    expect(byPsa.SA50.sfpClass).toBe('little');
    expect(byPsa.NC03A.sfpClass).toBeNull();
    expect(byPsa.NC03A.sfpLabel).toBe('Not yet updated for this date');
    expect(byPsa.SA46.gacc).toBe('Southern Area');
  });

  it('reads the forecast date from the service timestamp (UTC midnight)', () => {
    expect(fc.features[0].properties.forecastDate).toBe('2026-10-20');
    expect(sfpForecastDate(null)).toBeNull();
    expect(sfpForecastDate('garbage')).toBeNull();
  });

  it('summarizes issued vs not-yet-updated areas', () => {
    expect(summarizeSfp(fc)).toEqual({ forecastDate: '2026-10-20', areas: 4, issued: 3, notUpdated: 1 });
  });

  it('drops features without geometry and tolerates an empty body', () => {
    expect(normalizeSfp({ features: [{ properties: {} }] }, 1).features).toHaveLength(0);
    expect(normalizeSfp(null, 1).features).toHaveLength(0);
  });
});

describe('NWCG significant fire potential: query and proxy', () => {
  it('queries layer day-1 through the arcgis proxy route', () => {
    expect(sfpQueryUrl(1)).toMatch(/^\/api\/arcgis\/nwcg-sfp\/0\/query\?/);
    expect(sfpQueryUrl(7)).toMatch(/\/nwcg-sfp\/6\/query\?/);
    expect(() => sfpQueryUrl(8)).toThrow();
  });

  it('only sends params the edge proxy forwards (others would be silently dropped)', () => {
    const params = new URL(sfpQueryUrl(3), 'https://x.test').searchParams;
    for (const key of params.keys()) expect(ALLOWED_PARAMS).toContain(key);
  });

  it('routes to the NWCG ArcGIS server on the outlook cache tier', () => {
    expect(ARCGIS_ROUTES['nwcg-sfp']).toEqual({
      origin: 'https://fsapps.nwcg.gov',
      path: '/psp/arcgis/rest/services/npsg/outlooks_forecast/MapServer',
      tier: 'outlook',
    });
  });

  it('fetches, normalizes and caches a day', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(FIXTURE));
    const a = await fetchSignificantFirePotential(1);
    const b = await fetchSignificantFirePotential(1);
    expect(a.features).toHaveLength(4);
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchJson', () => {
  it('retries once, then succeeds', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    await expect(fetchJson('/x', 'k1', 1000, { retryDelayMs: 0 })).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an ArcGIS error body as a failure and never caches it', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ error: { code: 500, message: 'Unable to complete operation.' } }));
    await expect(fetchJson('/x', 'k2', 60000, { retryDelayMs: 0 })).rejects.toThrow('Unable to complete operation.');
    fetchMock.mockResolvedValue(jsonResponse({ fresh: true }));
    await expect(fetchJson('/x', 'k2', 60000, { retryDelayMs: 0 })).resolves.toEqual({ fresh: true });
  });

  it('fails on HTTP errors after the retry', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, false, 503));
    await expect(fetchJson('/x', 'k3', 1000, { retryDelayMs: 0 })).rejects.toThrow('HTTP 503');
  });
});

describe('freshness', () => {
  // 2026-10-20 08:30 MDT
  const morning = new Date('2026-10-20T14:30:00Z');

  it('uses the Mountain Time calendar date, not UTC', () => {
    // 2026-10-21 03:00 UTC is still the evening of the 20th in Denver
    expect(productDate(new Date('2026-10-21T03:00:00Z'))).toBe('2026-10-20');
    expect(productDate(morning, 6)).toBe('2026-10-26');
  });

  it('calls a partly issued day partial, and a fully issued day current', () => {
    expect(sfpFreshness({ forecastDate: '2026-10-20', areas: 4, issued: 3, notUpdated: 1 }, 1, morning).status).toBe('partial');
    expect(sfpFreshness({ forecastDate: '2026-10-20', areas: 4, issued: 4, notUpdated: 0 }, 1, morning).status).toBe('current');
    expect(sfpFreshness({ forecastDate: '2026-10-20', areas: 4, issued: 0, notUpdated: 4 }, 1, morning).status).toBe('pending');
  });

  it('flags yesterday\'s product as stale', () => {
    const f = sfpFreshness({ forecastDate: '2026-10-19', areas: 4, issued: 4, notUpdated: 0 }, 1, morning);
    expect(f).toEqual({ status: 'stale', expectedDate: '2026-10-20', forecastDate: '2026-10-19' });
  });

  it('checks later days against today + (day - 1)', () => {
    expect(sfpFreshness({ forecastDate: '2026-10-26', areas: 1, issued: 1, notUpdated: 0 }, 7, morning).status).toBe('current');
    expect(sfpFreshness({ forecastDate: '2026-10-25', areas: 1, issued: 1, notUpdated: 0 }, 7, morning).status).toBe('stale');
  });
});

describe('drawer status text', () => {
  const base = { day: 1, loading: false, error: null };
  const summary = { forecastDate: '2026-10-20', areas: 234, issued: 56, notUpdated: 178 };

  it('says loading, then unavailable with retry when nothing loaded', () => {
    expect(sfpStatus({ ...base, data: null, loading: true }).tone).toBe('loading');
    const s = sfpStatus({ ...base, data: null, error: new Error('HTTP 502') });
    expect(s).toMatchObject({ tone: 'error', retry: true });
    expect(s.text).toContain('HTTP 502');
  });

  it('reports partial issuance with counts instead of implying national coverage', () => {
    const s = sfpStatus({ ...base, data: {}, summary, freshness: { status: 'partial' } });
    expect(s.text).toContain('56 of 234 areas issued');
  });

  it('labels stale data with the date it is actually for', () => {
    const s = sfpStatus({
      ...base, data: {}, summary: { ...summary, forecastDate: '2026-10-19' },
      freshness: { status: 'stale', expectedDate: '2026-10-20', forecastDate: '2026-10-19' },
    });
    expect(s.tone).toBe('error');
    expect(s.text).toContain(formatForecastDate('2026-10-19'));
    expect(s.text).toContain(formatForecastDate('2026-10-20'));
  });

  it('keeps showing data but offers retry when a refresh failed', () => {
    const s = sfpStatus({ ...base, data: {}, summary, error: new Error('x'), freshness: { status: 'current' } });
    expect(s.retry).toBe(true);
    expect(s.text).toContain("couldn't refresh");
  });
});

describe('LANDFIRE FBFM40', () => {
  it('describes standard codes and rejects NoData', () => {
    expect(describeFuelModel(145)).toMatchObject({ model: 'SH5', group: 'SH', groupLabel: 'Shrub', burnable: true });
    expect(describeFuelModel('91')).toMatchObject({ model: 'NB1', burnable: false });
    expect(describeFuelModel('NoData')).toBeNull();
    expect(describeFuelModel(-9999)).toBeNull();
  });

  it('has the 45 FBFM40 codes with model ids matching their code ranges', () => {
    expect(Object.keys(FBFM40)).toHaveLength(45);
    const prefixFor = (code) => (code < 100 ? 'NB' : code < 120 ? 'GR' : code < 140 ? 'GS' : code < 160 ? 'SH' : code < 180 ? 'TU' : code < 200 ? 'TL' : 'SB');
    for (const [code, { model }] of Object.entries(FBFM40)) expect(model.slice(0, 2)).toBe(prefixFor(Number(code)));
  });

  it('builds legend groups only from models with a LANDFIRE colour', () => {
    const groups = fuelLegendGroups();
    expect(groups.map((g) => g.id)).toEqual(['NB', 'GR', 'GS', 'SH', 'TU', 'TL', 'SB']);
    expect(groups.flatMap((g) => g.models).every((m) => /^#[0-9a-f]{6}$/.test(m.color))).toBe(true);
    expect(groups.flatMap((g) => g.models).map((m) => m.model)).not.toContain('GR9');
  });

  it('has a proxy route pair for every client service, LF2024 drawn beneath LF2025', () => {
    const ids = LANDFIRE_FBFM40_SERVICES.map((s) => s.id);
    expect(new Set(ids)).toEqual(new Set(Object.keys(LANDFIRE_SERVICES)));
    for (const id of ids) {
      expect(ARCGIS_ROUTES[`lf-${id}`]).toMatchObject({ origin: 'https://lfps.usgs.gov', tier: 'static' });
      expect(ARCGIS_ROUTES[`lf-${id}`].forcedParams).toBeUndefined();
      expect(ARCGIS_ROUTES[`lf-${id}-tiles`].forcedParams).toEqual({
        bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true',
      });
    }
    expect(ids.indexOf('conus-2024')).toBeLessThan(ids.indexOf('conus-2025'));
  });

  it('picks the services covering a point, newest first', () => {
    expect(landfireServicesFor(38.5, -120.5).map((s) => s.id)).toEqual(['conus-2025', 'conus-2024']);
    expect(landfireServicesFor(64.8, -147.7).map((s) => s.id)).toEqual(['ak-2025']);
    expect(landfireServicesFor(19.7, -155.1).map((s) => s.id)).toEqual(['hi-2024']);
    expect(landfireServicesFor(18.2, -66.5).map((s) => s.id)).toEqual(['prvi-2024']);
    expect(landfireServicesFor(0, 0)).toEqual([]);
  });

  it('requests tiles through the proxy with only params it forwards', () => {
    const url = landfireTileUrl(LANDFIRE_FBFM40_SERVICES[1]);
    expect(url).toBe('/api/arcgis/lf-conus-2025-tiles/exportImage?bbox={bbox-epsg-3857}&f=image');
    for (const key of new URL(url, 'https://x.test').searchParams.keys()) expect(ALLOWED_PARAMS).toContain(key);
  });

  it('identifies a point from the newest release with data', async () => {
    // Shape observed from LF2025_FBFM40_CONUS /identify on 2026-10-20
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ objectId: 0, name: 'Pixel', value: '102', properties: null }));
    const r = await fetchFuelModelAt(38.5, -120.5);
    expect(r.service.id).toBe('conus-2025');
    expect(r.fuel).toMatchObject({ model: 'GR2' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0], 'https://x.test');
    expect(url.pathname).toBe('/api/arcgis/lf-conus-2025/identify');
    for (const key of url.searchParams.keys()) expect(ALLOWED_PARAMS).toContain(key);
  });

  it('falls back to LF2024 where LF2025 has no data (eastern US)', async () => {
    // Observed 2026-10-20 near Macon, GA: LF2025 NoData, LF2024 186 (TL6)
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ value: 'NoData' }))
      .mockResolvedValueOnce(jsonResponse({ value: '186' }));
    const r = await fetchFuelModelAt(33.2, -84.2);
    expect(r.service.id).toBe('conus-2024');
    expect(r.fuel).toMatchObject({ model: 'TL6' });
  });

  it('reports NoData everywhere as no fuel model, and outside coverage as null', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ value: 'NoData' }));
    expect((await fetchFuelModelAt(36.9, -123.5)).fuel).toBeNull();
    expect(await fetchFuelModelAt(0, 0)).toBeNull();
  });
});
