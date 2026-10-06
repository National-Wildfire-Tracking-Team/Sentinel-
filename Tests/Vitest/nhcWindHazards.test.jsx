import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const layerProps = [];
const sourceProps = [];
vi.mock('react-map-gl', () => ({
  Source: (props) => { sourceProps.push(props); return <>{props.children}</>; },
  Layer: (props) => { layerProps.push(props); return null; },
}));

const { fetchNhcWindHazards, nhcSurgeTileUrl } = await import('../../src/app/api/nhcTropicalWeather');
const { default: NhcWindHazardsLayer } = await import('../../src/app/components/Map/layers/NhcWindHazardsLayer');

// Layer ids as the live service names them (Oct 2026).
const LAYERS = [
  { id: 136, name: 'EP3 Forecast Points' },
  { id: 146, name: 'EP3 Forecast Wind Radii' },
  { id: 150, name: 'EP3 Most Likely Arrival Time' },
  { id: 206, name: 'Footprint_Inun_EP3' },
  { id: 207, name: 'Image_Inun_EP3' },
  { id: 24, name: 'Footprint_Inun_AT1' },
  { id: 25, name: 'Image_Inun_AT1' },
  { id: 395, name: 'Probabilistic Winds 34 kts' },
  { id: 397, name: 'Probabilistic Winds 64 kts' },
];
const poly = { type: 'Polygon', coordinates: [[[-120, 19], [-118, 19], [-118, 21], [-120, 19]]] };
const fc = (features) => ({ type: 'FeatureCollection', features });

function mockService({ surgeCount = 0 } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    const json = (body) => new Response(JSON.stringify(body));
    if (u.includes('/layers?f=json')) return json({ layers: LAYERS });
    if (u.includes('/395/query')) {
      return json(fc([
        { type: 'Feature', geometry: poly, properties: { percentage: '<5%' } },
        { type: 'Feature', geometry: poly, properties: { percentage: '40-50%' } },
      ]));
    }
    if (u.includes('/146/query')) {
      return json(fc([
        { type: 'Feature', geometry: poly, properties: { radii: 34, tau: 0, ne: 130, se: 110, sw: 100, nw: 110 } },
        { type: 'Feature', geometry: poly, properties: { radii: 64, tau: 36, ne: 20 } },
      ]));
    }
    if (u.includes('/150/query')) {
      return json(fc([{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[-120, 20], [-119, 21]] }, properties: { arrival_time: 'Tue 8 am' } }]));
    }
    if (u.includes('/206/query')) return json({ count: 0 });
    if (u.includes('/24/query')) return json({ count: surgeCount });
    throw new Error(`unexpected ${u}`);
  });
}

beforeEach(() => { layerProps.length = 0; sourceProps.length = 0; localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

describe('fetchNhcWindHazards', () => {
  it('fetches only the requested products, simplified, and normalizes them', async () => {
    const fetchSpy = mockService();
    const data = await fetchNhcWindHazards({ slots: ['EP3'], probKt: 34, radii: true, arrival: true, surge: true });

    // <5% is NHC's transparent background band.
    expect(data.windProbGeoJSON.features.map((f) => f.properties)).toEqual([{ percentage: '40-50%', thresholdKt: 34 }]);
    expect(data.windRadiiGeoJSON.features.map((f) => [f.properties.radiiKt, f.properties.tau, f.properties.slot]))
      .toEqual([[34, 0, 'EP3'], [64, 36, 'EP3']]);
    expect(data.arrivalGeoJSON.features[0].properties.arrivalTime).toBe('Tue 8 am');
    expect(data.surgeImageLayerIds).toEqual([]);

    const probUrl = fetchSpy.mock.calls.map(([u]) => String(u)).find((u) => u.includes('/395/query'));
    expect(probUrl).toContain('maxAllowableOffset=0.05');
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/397/'))).toBe(false);
  });

  it('turns on surge tiles only for storms with an inundation footprint', async () => {
    mockService({ surgeCount: 3 });
    // AT1 (a U.S. landfall threat) has a footprint; EP3 doesn't.
    const data = await fetchNhcWindHazards({ slots: ['EP3', 'AT1'], surge: true });
    expect(data.surgeImageLayerIds).toEqual([25]);
    expect(data.windProbGeoJSON.features).toEqual([]);
  });
});

describe('nhcSurgeTileUrl', () => {
  it('builds a NOAA export tile template for the image layers', () => {
    const url = nhcSurgeTileUrl([207, 129]);
    expect(url).toMatch(/^https:\/\/mapservices\.weather\.noaa\.gov\/.+\/export\?/);
    expect(url).toContain('bbox={bbox-epsg-3857}');
    expect(url).toContain('layers=show:207,129');
    expect(nhcSurgeTileUrl([])).toBeNull();
  });
});

describe('NhcWindHazardsLayer', () => {
  const data = {
    windProbGeoJSON: fc([]), windRadiiGeoJSON: fc([]), arrivalGeoJSON: fc([]), surgeImageLayerIds: [207],
  };
  const visibility = (id) => layerProps.filter((l) => l.id === id).at(-1)?.layout?.visibility;

  it('shows each product only when its switch is on', () => {
    render(<NhcWindHazardsLayer data={data} visible show={{ prob: true, radii: false, arrival: true, surge: false }} />);
    expect(visibility('nhc-wind-prob-fill')).toBe('visible');
    expect(visibility('nhc-wind-radii-fill')).toBe('none');
    expect(visibility('nhc-arrival-label')).toBe('visible');
    expect(sourceProps.some((s) => s.id === 'nhc-surge')).toBe(false);
  });

  it('adds surge raster tiles when switched on and available', () => {
    render(<NhcWindHazardsLayer data={data} visible show={{ surge: true }} />);
    const surge = sourceProps.find((s) => s.id === 'nhc-surge');
    expect(surge.type).toBe('raster');
    expect(surge.tiles[0]).toContain('layers=show:207');
  });

  it('hides everything off the tropical tabs', () => {
    render(<NhcWindHazardsLayer data={data} visible={false} show={{ prob: true, radii: true, arrival: true, surge: true }} />);
    expect(layerProps.every((l) => l.layout?.visibility === 'none')).toBe(true);
    expect(sourceProps.some((s) => s.id === 'nhc-surge')).toBe(false);
  });
});
