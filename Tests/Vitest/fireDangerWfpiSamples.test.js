/**
 * fireDangerWfpiSamples.test.js
 * USGS WFPI and NWCC fuel moisture samples on the client, and their proxy routes.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { WFPI_CLASSES, defaultWfpiDay, describeWfpi, fetchWfpiAt, wfpiTileUrl } from '../../src/app/api/fireDanger/wfpi';
import { IMPLAUSIBLE_PCT, groupSamplesBySite, samplesQueryUrl, siteFuels } from '../../src/app/api/fireDanger/fieldSamples';
import { samplesStatus, wfpiStatus } from '../../src/app/api/fireDanger/status';
import { ALLOWED_PARAMS } from '../../netlify/edge-functions/_shared/edgeProxy.js';
import { ROUTES } from '../../netlify/edge-functions/arcgis-proxy.js';
import { clearCache } from '../../src/app/utils/dataCache';

afterEach(() => { vi.restoreAllMocks(); clearCache(); });

const params = (url) => [...new URL(url, 'https://x.test').searchParams.keys()];

describe('WFPI', () => {
  it('reads index values and land-cover codes per USGS legend', () => {
    expect(describeWfpi(54)).toEqual({ index: 54, color: '#c2ff6e' });
    expect(describeWfpi(0).color).toBe(WFPI_CLASSES[0][1]);
    expect(describeWfpi(200).color).toBe('#ff0000');
    expect(describeWfpi(254)).toEqual({ code: 254, label: 'Water' });
    expect(describeWfpi(248)).toBeNull();
    expect(describeWfpi('x')).toBeNull();
  });

  it('routes tiles and point queries through the proxy with only forwarded params', () => {
    expect(wfpiTileUrl(3)).toBe('/api/arcgis/usgs-wfpi-3-tiles?bbox={bbox-epsg-3857}');
    for (const k of params(wfpiTileUrl(3))) expect(ALLOWED_PARAMS).toContain(k);
    for (const day of [1, 7]) {
      expect(ROUTES[`usgs-wfpi-${day}-tiles`].forcedParams).toMatchObject({ request: 'GetMap', crs: 'EPSG:3857', layers: `wfpi-forecast-${day}_conus_day_data` });
      expect(ROUTES[`usgs-wfpi-${day}`].forcedParams).toMatchObject({ request: 'GetFeatureInfo', info_format: 'application/json' });
    }
  });

  it('asks for a point in lat,lon bbox order (WMS 1.3.0, EPSG:4326)', async () => {
    // Response shape observed from USGS GetFeatureInfo on 2026-10-20
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ type: 'FeatureCollection', features: [{ properties: { PALETTE_INDEX: 49 } }] }) });
    expect(await fetchWfpiAt(2, 38.5, -121)).toMatchObject({ index: 49 });
    const url = new URL(fetchMock.mock.calls[0][0], 'https://x.test');
    expect(url.pathname).toBe('/api/arcgis/usgs-wfpi-2');
    expect(url.searchParams.get('bbox')).toBe('38.49500,-121.00500,38.50500,-120.99500');
  });

  it('picks the day valid today', () => {
    const dates = ['2026-10-19', '2026-10-20', '2026-10-21'];
    expect(defaultWfpiDay(dates, '2026-10-20')).toBe(2);
    expect(defaultWfpiDay(null, '2026-10-20')).toBe(1);
  });

  it('says what each state means', () => {
    const w = { day: 2, validDate: '2026-10-20', source: { status: 'ok', validDates: [] } };
    expect(wfpiStatus(w, true).text).toMatch(/Day 2 of USGS's newest run · valid/);
    expect(wfpiStatus(w, false).text).toMatch(/once the fire danger service is connected/);
    expect(wfpiStatus({ ...w, source: { status: 'ok', stale: true, validDates: ['2026-10-10'] } }, true).tone).toBe('error');
  });
});

describe('field samples', () => {
  const rec = (site, fuel, value, date, extra = {}) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [-116, 44] },
    properties: { site_id: site, site_name: `S${site}`, state_id: 'ID', fuel_type: fuel, fuel_category: 'Shrub', sample_average_value: value, sample_date: `${date}T00:00Z`, method_type: 'Gravimetric', ...extra },
  });

  it('keeps the newest sample per fuel per site, as published, and flags implausible values', () => {
    const fc = groupSamplesBySite({ features: [
      rec(1, 'Sagebrush, Wyoming Big', 95.2, '2026-10-01'),
      rec(1, 'Sagebrush, Wyoming Big', 88.1, '2026-10-15'),
      rec(1, 'Pine, Ponderosa', 6057.08, '2026-10-10', { fuel_category: 'Tree' }),
      rec(2, '1-Hour', 5, '2026-10-15', { fuel_category: 'Dead' }),
    ] });
    expect(fc.features).toHaveLength(1);
    const p = fc.features[0].properties;
    expect(p.latestDate).toBe('2026-10-15');
    const fuels = siteFuels(p);
    expect(fuels.find((f) => f.fuel.startsWith('Sagebrush'))).toMatchObject({ value: 88.1, date: '2026-10-15', implausible: false });
    expect(fuels.find((f) => f.fuel.startsWith('Pine'))).toMatchObject({ value: 6057.08, implausible: true });
    expect(IMPLAUSIBLE_PCT).toBe(400);
  });

  it('queries only submitted live samples from the last 60 days, via the proxy', () => {
    const url = new URL(samplesQueryUrl(), 'https://x.test');
    expect(url.pathname).toBe('/api/arcgis/nwcc-fuel-moisture/0/query');
    expect(url.searchParams.get('where')).toMatch(/sample_status IN \('Submitted','Edited'\)/);
    expect(url.searchParams.get('where')).toMatch(/CURRENT_TIMESTAMP - 60/);
    for (const k of url.searchParams.keys()) expect(ALLOWED_PARAMS).toContain(k);
    expect(ROUTES['nwcc-fuel-moisture'].origin).toBe('https://services3.arcgis.com');
  });

  it('reports site counts and the newest sample', () => {
    const data = groupSamplesBySite({ features: [rec(1, 'Sage', 90, '2026-10-15'), rec(2, 'Sage', 90, '2026-10-17')] });
    expect(samplesStatus({ data }).text).toMatch(/^2 sites sampled in the last 60 days · newest/);
  });
});
