import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeCalFireHistoricalPerimeters } from '../../src/app/api/calFirePerimeters';

vi.mock('../../src/app/utils/dataCache');

let fetchCalFireHistoricalPerimeters;
let fetchWithCache;

// calFirePerimeters reads VITE_CALFIRE_FRAP_PROXY_URL at import time, so pin
// it (a local .env may set it) and re-import the module for each test.
async function loadModule({ proxyUrl = '' } = {}) {
  vi.stubEnv('VITE_CALFIRE_FRAP_PROXY_URL', proxyUrl);
  vi.resetModules();
  ({ fetchCalFireHistoricalPerimeters } = await import('../../src/app/api/calFirePerimeters'));
  ({ fetchWithCache } = await import('../../src/app/utils/dataCache'));
  fetchWithCache.mockReset();
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await loadModule();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeCalFireHistoricalPerimeters', () => {
  it('maps FRAP fields to the flat schema', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: {
            FIRE_NAME: 'Test Fire',
            YEAR_: 2020,
            GIS_ACRES: 12345,
            ALARM_DATE: '2020-08-01T00:00:00Z',
            CONT_DATE: '2020-08-10T00:00:00Z',
            AGENCY: 'CDF',
            UNIT_ID: 'BTU',
            CAUSE: 9,
            INC_NUM: '20CABTU000001',
          },
        },
      ],
    };

    const result = normalizeCalFireHistoricalPerimeters(geojson);
    expect(result.features).toHaveLength(1);
    const props = result.features[0].properties;
    expect(props.FireName).toBe('Test Fire');
    expect(props.FireYear).toBe(2020);
    expect(props.GISAcres).toBe(12345);
    expect(props.Agency).toBe('CDF');
    expect(props.UnitId).toBe('BTU');
    expect(props._source).toBe('CALFIRE_FRAP');
  });

  it('falls back to COMPLEX_NAME and Unknown Fire when FIRE_NAME is missing', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        { properties: { COMPLEX_NAME: 'Some Complex' } },
        { properties: {} },
      ],
    };
    const result = normalizeCalFireHistoricalPerimeters(geojson);
    expect(result.features[0].properties.FireName).toBe('Some Complex');
    expect(result.features[1].properties.FireName).toBe('Unknown Fire');
  });
});

describe('fetchCalFireHistoricalPerimeters', () => {
  it('returns normalized perimeters on success', async () => {
    fetchWithCache.mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        { properties: { FIRE_NAME: 'Camp', YEAR_: 2018, GIS_ACRES: 153336 } },
      ],
    });

    const result = await fetchCalFireHistoricalPerimeters({ minYear: 2018 });
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.FireName).toBe('Camp');
  });

  it('falls back to mock data on fetch failure', async () => {
    vi.useFakeTimers();
    fetchWithCache.mockRejectedValue(new Error('network error'));

    const promise = fetchCalFireHistoricalPerimeters();
    await vi.runAllTimersAsync();
    const result = await promise;

    vi.useRealTimers();
    expect(result.features.length).toBeGreaterThan(0);
    expect(result.features[0].properties._source).toBe('CALFIRE_FRAP');
  });

  it('falls back to mock data on ArcGIS error payload', async () => {
    vi.useFakeTimers();
    fetchWithCache.mockResolvedValue({ error: { message: 'Invalid query parameters' } });

    const promise = fetchCalFireHistoricalPerimeters();
    await vi.runAllTimersAsync();
    const result = await promise;

    vi.useRealTimers();
    expect(result.features.length).toBeGreaterThan(0);
  });

  it('tries egis.fire.ca.gov first, then falls back to the ArcGIS Online mirror', async () => {
    vi.useFakeTimers();
    fetchWithCache.mockImplementation(async (url) => {
      if (url.includes('/api/arcgis/frap-egis')) throw new Error('CORS blocked');
      return {
        type: 'FeatureCollection',
        features: [{ properties: { FIRE_NAME: 'Mirror Fire', YEAR_: 2019, GIS_ACRES: 500 } }],
      };
    });

    const promise = fetchCalFireHistoricalPerimeters();
    await vi.runAllTimersAsync();
    const result = await promise;

    vi.useRealTimers();
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.FireName).toBe('Mirror Fire');
    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/api/arcgis/frap-egis'), expect.anything(), expect.anything(), expect.anything()
    );
    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/api/arcgis/frap-mirror'), expect.anything(), expect.anything(), expect.anything()
    );
  });

  it('falls back to data.ca.gov when both ArcGIS sources fail, resolving the resource via CKAN package_show', async () => {
    vi.useFakeTimers();
    fetchWithCache.mockImplementation(async (url) => {
      if (url.includes('/api/arcgis/frap-egis') || url.includes('/api/arcgis/frap-mirror')) {
        throw new Error('ArcGIS unavailable');
      }
      if (url.includes('data.ca.gov/api/3/action/package_show')) {
        return {
          success: true,
          result: {
            resources: [
              { format: 'CSV', url: 'https://data.ca.gov/dataset/fire-perimeters.csv' },
              { format: 'GeoJSON', url: 'https://data.ca.gov/dataset/fire-perimeters.geojson' },
            ],
          },
        };
      }
      if (url === 'https://data.ca.gov/dataset/fire-perimeters.geojson') {
        return {
          type: 'FeatureCollection',
          features: [
            { properties: { FIRE_NAME: 'Open Data Fire', YEAR_: 2021, GIS_ACRES: 900 } },
            { properties: { FIRE_NAME: 'Too Old Fire', YEAR_: 1999, GIS_ACRES: 900 } },
          ],
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const promise = fetchCalFireHistoricalPerimeters({ minYear: 2018 });
    await vi.runAllTimersAsync();
    const result = await promise;

    vi.useRealTimers();
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.FireName).toBe('Open Data Fire');
    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('data.ca.gov/api/3/action/package_show'),
      expect.anything(), expect.anything(), expect.anything()
    );
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://data.ca.gov/dataset/fire-perimeters.geojson',
      expect.anything(), expect.anything(), expect.anything()
    );
  });

  it('uses calfire-frap-proxy instead of data.ca.gov when VITE_CALFIRE_FRAP_PROXY_URL is set', async () => {
    await loadModule({ proxyUrl: 'https://proxy.example.test' });
    vi.useFakeTimers();
    fetchWithCache.mockImplementation(async (url) => {
      if (url.includes('/api/arcgis/frap-egis') || url.includes('/api/arcgis/frap-mirror')) {
        throw new Error('ArcGIS unavailable');
      }
      if (url.startsWith('https://proxy.example.test/perimeters?')) {
        return {
          type: 'FeatureCollection',
          features: [{ properties: { FIRE_NAME: 'Proxy Fire', YEAR_: 2022, GIS_ACRES: 700 } }],
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const promise = fetchCalFireHistoricalPerimeters({ minYear: 2018, minAcres: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;

    vi.useRealTimers();
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.FireName).toBe('Proxy Fire');
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://proxy.example.test/perimeters?minYear=2018&minAcres=100',
      expect.anything(), expect.anything(), expect.anything()
    );
    expect(fetchWithCache).not.toHaveBeenCalledWith(
      expect.stringContaining('data.ca.gov'),
      expect.anything(), expect.anything(), expect.anything()
    );
  });
});
