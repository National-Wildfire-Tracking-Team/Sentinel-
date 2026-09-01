import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  gaugesToGeoJSON,
  categoryForStage,
  fetchWaterGauges,
  fetchGaugeDetail,
  fetchGaugeStageFlow,
} from '../../src/app/api/noaaWaterGauge';

// Bypass the module-level cache so every fetch test exercises the network path.
vi.mock('../../src/app/utils/dataCache', () => ({
  getCached: vi.fn(() => null),
  setCached: vi.fn(),
}));

import { setCached } from '../../src/app/utils/dataCache';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('gaugesToGeoJSON', () => {
  it('maps NWPS gauge live water-level info into feature properties that drive the overlay', () => {
    const gauges = [
      {
        lid: 'CCKC1',
        name: 'Sacramento River at Colusa',
        state: 'CA',
        county: 'Colusa',
        hsa: 'STO',
        datum: 'NAVD88',
        latitude: 39.21,
        longitude: -122.01,
        flood: { action: 45, minor: 50, moderate: 55, major: 60 },
        status: { observed: { primary: { value: 52.3 }, floodCategory: 'minor' } },
      },
    ];

    const geojson = gaugesToGeoJSON(gauges);

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(1);

    const f = geojson.features[0];
    expect(f.type).toBe('Feature');
    expect(f.geometry.type).toBe('Point');
    // GeoJSON is [lon, lat]
    expect(f.geometry.coordinates).toEqual([-122.01, 39.21]);

    const p = f.properties;
    expect(p.lid).toBe('CCKC1');
    expect(p.name).toBe('Sacramento River at Colusa');
    expect(p.state).toBe('CA');
    expect(p.county).toBe('Colusa');
    // Live water-level information used for the on-map graphical overlay:
    expect(p.currentStage).toBe(52.3);   // stage label
    expect(p.floodCategory).toBe('minor'); // circle color
    expect(p.actionStage).toBe(45);
    expect(p.minorStage).toBe(50);
    expect(p.moderateStage).toBe(55);
    expect(p.majorStage).toBe(60);
  });

  it('reads the REAL NWPS shape: primary as a number + flood.categories.{cat}.stage', () => {
    const gauges = [
      {
        lid: 'CAGM7',
        name: 'Missouri River at Hermann',
        state: { abbreviation: 'MO', name: 'Missouri' }, // real API returns an object
        county: 'Gasconade',
        wfo: { abbreviation: 'LSX', name: 'St. Louis' },
        latitude: 38.71,
        longitude: -91.44,
        flood: {
          categories: {
            action:   { stage: 16, flow: 100 },
            minor:    { stage: 21, flow: 200 },
            moderate: { stage: 27, flow: 300 },
            major:    { stage: 30, flow: 400 },
          },
        },
        status: { observed: { primary: 22.4, primaryUnit: 'ft', floodCategory: 'minor' } },
      },
    ];

    const p = gaugesToGeoJSON(gauges).features[0].properties;
    expect(p.currentStage).toBe(22.4);
    expect(p.floodCategory).toBe('minor');
    expect(p.actionStage).toBe(16);
    expect(p.minorStage).toBe(21);
    expect(p.moderateStage).toBe(27);
    expect(p.majorStage).toBe(30);
    // Object-valued state / wfo are flattened to strings the UI can render.
    expect(p.state).toBe('MO');
    expect(p.hsa).toBe('LSX');
  });

  it('derives the flood category from the stage when the API omits floodCategory', () => {
    const gauges = [
      {
        lid: 'NOCAT1',
        latitude: 30,
        longitude: -90,
        flood: { categories: { action: { stage: 10 }, minor: { stage: 15 }, moderate: { stage: 20 }, major: { stage: 25 } } },
        status: { observed: { primary: 21.0 } }, // no floodCategory field
      },
    ];

    const p = gaugesToGeoJSON(gauges).features[0].properties;
    expect(p.currentStage).toBe(21.0);
    expect(p.floodCategory).toBe('moderate'); // 21 ≥ moderate(20), < major(25)
  });

  it('normalises verbose / spaced category strings to canonical keys', () => {
    const gauges = [
      { lid: 'X', latitude: 1, longitude: 2, status: { observed: { primary: 5, floodCategory: 'Major Flood' } } },
    ];
    expect(gaugesToGeoJSON(gauges).features[0].properties.floodCategory).toBe('major');
  });

  it('reads the alternate status shape (status.current.primaryStage)', () => {
    const gauges = [
      {
        lid: 'ABC1',
        latitude: 30,
        longitude: -90,
        status: { current: { primaryStage: { value: 12.5 } } },
      },
    ];

    const p = gaugesToGeoJSON(gauges).features[0].properties;
    expect(p.currentStage).toBe(12.5);
  });

  it('defaults floodCategory to no_flooding and stages to null when absent', () => {
    const gauges = [{ lid: 'ABC2', latitude: 40, longitude: -100 }];

    const p = gaugesToGeoJSON(gauges).features[0].properties;
    expect(p.floodCategory).toBe('no_flooding');
    expect(p.currentStage).toBeNull();
    expect(p.actionStage).toBeNull();
    expect(p.majorStage).toBeNull();
  });

  it('reads coordinates from nested geometry when lat/lon are absent', () => {
    const gauges = [
      { lid: 'GEO1', geometry: { coordinates: [-95.5, 29.7] } },
    ];

    const f = gaugesToGeoJSON(gauges).features[0];
    expect(f.geometry.coordinates).toEqual([-95.5, 29.7]);
  });

  it('skips gauges without usable coordinates', () => {
    const gauges = [
      { lid: 'NO_COORDS', name: 'Missing location' },
      { lid: 'OK', latitude: 1, longitude: 2 },
    ];

    const geojson = gaugesToGeoJSON(gauges);
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].properties.lid).toBe('OK');
  });

  it('returns an empty FeatureCollection for an empty list', () => {
    const geojson = gaugesToGeoJSON([]);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(0);
  });
});

describe('categoryForStage', () => {
  const thr = { action: 10, minor: 15, moderate: 20, major: 25 };
  it('classifies stages against thresholds in descending severity', () => {
    expect(categoryForStage(26, thr)).toBe('major');
    expect(categoryForStage(22, thr)).toBe('moderate');
    expect(categoryForStage(16, thr)).toBe('minor');
    expect(categoryForStage(11, thr)).toBe('action');
    expect(categoryForStage(5, thr)).toBe('no_flooding');
  });
  it('returns null when the stage is unknown', () => {
    expect(categoryForStage(null, thr)).toBeNull();
  });
});

describe('fetchWaterGauges', () => {
  afterEach(() => vi.unstubAllGlobals());

  const arcgisFeature = (props = {}, coords = [-100, 40]) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: {
      gaugelid: 'ARC1', status: 'no_flooding', location: 'Test Gauge', waterbody: 'Test River',
      state: 'CA', wfo: 'sto', url: 'https://water.noaa.gov/gauges/arc1',
      action: '', flood: '', moderate: '', major: '', observed: '5.1', hdatum: 'none',
      ...props,
    },
  });

  it('reads gauges from the ArcGIS river-gauge source on the first attempt', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('/api/river-gauges-forecast')) {
        return Promise.resolve({ ok: true, json: async () => ({ features: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ features: [arcgisFeature()] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const geo = await fetchWaterGauges();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/river-gauges?');
    expect(fetchMock.mock.calls[1][0]).toContain('/api/river-gauges-forecast?');
    expect(geo.features).toHaveLength(1);
    const p = geo.features[0].properties;
    expect(p.lid).toBe('ARC1');
    expect(p.currentStage).toBe(5.1);
    expect(p.floodCategory).toBe('no_flooding');
    expect(setCached).toHaveBeenCalled();
  });

  it('treats empty-string threshold/stage fields as null rather than 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [arcgisFeature({ action: '', flood: '', moderate: '', major: '' })] }),
    }));

    const geo = await fetchWaterGauges();
    const p = geo.features[0].properties;
    expect(p.actionStage).toBeNull();
    expect(p.minorStage).toBeNull();
    expect(p.moderateStage).toBeNull();
    expect(p.majorStage).toBeNull();
  });

  it('paginates past the ArcGIS 10k-record page cap', async () => {
    const fullPage = Array.from({ length: 10000 }, (_, i) => arcgisFeature({ gaugelid: `A${i}` }, [-100 + i * 0.0001, 40]));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: fullPage }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [arcgisFeature({ gaugelid: 'LAST' })] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) }); // forecast layer
    vi.stubGlobal('fetch', fetchMock);

    const geo = await fetchWaterGauges();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain('resultOffset=0');
    expect(fetchMock.mock.calls[1][0]).toContain('resultOffset=10000');
    expect(geo.features).toHaveLength(10001);
  });

  it('falls back to the NWPS list endpoint when the ArcGIS source errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 }) // ArcGIS attempt fails
      .mockResolvedValueOnce({ ok: true, json: async () => ({ gauges: [{ lid: 'NWPS1', latitude: 1, longitude: 2 }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) }); // forecast layer
    vi.stubGlobal('fetch', fetchMock);

    const geo = await fetchWaterGauges();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/nwps/gauges');
    expect(geo.features[0].properties.lid).toBe('NWPS1');
  });

  it('falls back to a US-wide bbox query when both the ArcGIS source and unfiltered NWPS endpoint are empty', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) }) // ArcGIS: empty
      .mockResolvedValueOnce({ ok: true, json: async () => ({ gauges: [] }) }) // NWPS unfiltered: empty
      .mockResolvedValueOnce({ ok: true, json: async () => ({ gauges: [{ lid: 'B', latitude: 4, longitude: 5 }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) }); // forecast layer
    vi.stubGlobal('fetch', fetchMock);

    const geo = await fetchWaterGauges();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const bboxUrl = fetchMock.mock.calls[2][0];
    expect(bboxUrl).toContain('/api/nwps/gauges?');
    expect(bboxUrl).toContain('bbox.xmin=');
    expect(bboxUrl).toContain('srid=EPSG_4326');
    expect(geo.features).toHaveLength(1);
    expect(geo.features[0].properties.lid).toBe('B');
  });

  it('throws only when every attempt (ArcGIS + both NWPS attempts) errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchWaterGauges()).rejects.toThrow('NWPS gauges HTTP 503');
  });

  it('marks a gauge forecastAboveAction=true when the forecast layer shows a category above no_flooding', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('/api/river-gauges-forecast')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            features: [{ properties: { gaugelid: 'ARC1', status: 'moderate', forecast: '30' } }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ features: [arcgisFeature({ action: '10' })] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const geo = await fetchWaterGauges();
    const p = geo.features[0].properties;
    expect(p.forecastStage).toBe(30);
    expect(p.forecastCategory).toBe('moderate');
    expect(p.forecastAboveAction).toBe(true);
  });

  it.each(['fcst_not_current', 'out_of_service', 'not_defined', 'low_threshold', 'no_flooding'])(
    'marks a gauge forecastAboveAction=false for forecast-layer status "%s" (not a real flood category)',
    async (status) => {
      const fetchMock = vi.fn((url) => {
        if (url.includes('/api/river-gauges-forecast')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ features: [{ properties: { gaugelid: 'ARC1', status, forecast: '-999' } }] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ features: [arcgisFeature({ action: '10' })] }) });
      });
      vi.stubGlobal('fetch', fetchMock);

      const geo = await fetchWaterGauges();
      expect(geo.features[0].properties.forecastAboveAction).toBe(false);
    }
  );

  it('marks a gauge forecastAboveAction=false when the forecast layer has no entry for it', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('/api/river-gauges-forecast')) {
        return Promise.resolve({ ok: true, json: async () => ({ features: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ features: [arcgisFeature({ action: '10' })] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const geo = await fetchWaterGauges();
    const p = geo.features[0].properties;
    expect(p.forecastStage).toBeNull();
    expect(p.forecastCategory).toBeNull();
    expect(p.forecastAboveAction).toBe(false);
  });

  it('falls back to forecastAboveAction=false for every gauge when the forecast layer fetch fails', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('/api/river-gauges-forecast')) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: true, json: async () => ({ features: [arcgisFeature({ action: '10' })] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const geo = await fetchWaterGauges();
    expect(geo.features[0].properties.forecastAboveAction).toBe(false);
  });

  it('does NOT cache an empty result (no negative caching)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [], gauges: [] }) }));

    const geo = await fetchWaterGauges();

    expect(geo.features).toHaveLength(0);
    expect(setCached).not.toHaveBeenCalled();
  });
});

describe('fetchGaugeDetail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalises the real detail shape into thresholds/currentStage/floodCategory/impacts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        lid: 'CAGM7',
        name: 'Missouri River at Hermann',
        state: { abbreviation: 'MO', name: 'Missouri' },
        flood: {
          categories: {
            action: { stage: 16 }, minor: { stage: 21 }, moderate: { stage: 27 }, major: { stage: 30 },
          },
          impacts: [
            { stage: 22, statement: 'Low-lying roads flood.' },
            { stage: 28, statement: 'Major agricultural losses.' },
          ],
        },
        status: { observed: { primary: 22.4, floodCategory: 'minor' } },
      }),
    }));

    const d = await fetchGaugeDetail('CAGM7');
    expect(d.currentStage).toBe(22.4);
    expect(d.floodCategory).toBe('minor');
    expect(d.thresholds).toEqual({ action: 16, minor: 21, moderate: 27, major: 30 });
    expect(d.state).toBe('MO');
    expect(d.impacts).toHaveLength(2);
    // Impact at 22 ft is banded minor (21–27), the one at 28 ft is moderate.
    expect(d.impacts[0]).toMatchObject({ stage: 22, category: 'minor' });
    expect(d.impacts[1]).toMatchObject({ stage: 28, category: 'moderate' });
  });
});

describe('fetchGaugeStageFlow', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the observed and forecast sub-endpoints and parses data[]', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.endsWith('/observed')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [
          { validTime: '2026-07-20T00:00:00Z', primary: 10.1 },
          { validTime: '2026-07-20T06:00:00Z', primary: 10.5 },
        ] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: [
        { validTime: '2026-07-21T00:00:00Z', primary: 11.0 },
      ] }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const s = await fetchGaugeStageFlow('CAGM7');

    const calledObserved = fetchMock.mock.calls.some(([u]) => u.endsWith('/stageflow/observed'));
    const calledForecast = fetchMock.mock.calls.some(([u]) => u.endsWith('/stageflow/forecast'));
    expect(calledObserved).toBe(true);
    expect(calledForecast).toBe(true);

    expect(s.observed).toHaveLength(2);
    expect(s.observed[0].stage).toBe(10.1);
    expect(Number.isFinite(s.observed[0].time)).toBe(true);
    expect(s.forecast).toHaveLength(1);
    expect(s.forecast[0].stage).toBe(11.0);
  });

  it('treats a failed sub-endpoint as an empty series rather than throwing', async () => {
    const fetchMock = vi.fn((url) =>
      url.endsWith('/observed')
        ? Promise.resolve({ ok: true, json: async () => ({ data: [{ validTime: '2026-07-20T00:00:00Z', primary: 9 }] }) })
        : Promise.resolve({ ok: false, status: 404 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const s = await fetchGaugeStageFlow('X');
    expect(s.observed).toHaveLength(1);
    expect(s.forecast).toEqual([]);
  });
});
