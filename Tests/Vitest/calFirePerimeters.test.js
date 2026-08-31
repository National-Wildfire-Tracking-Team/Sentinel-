import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchCalFireHistoricalPerimeters,
  normalizeCalFireHistoricalPerimeters,
} from '../../src/app/api/calFirePerimeters';
import { fetchWithCache } from '../../src/app/utils/dataCache';

vi.mock('../../src/app/utils/dataCache');

beforeEach(() => {
  vi.restoreAllMocks();
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
      if (url.includes('egis.fire.ca.gov')) throw new Error('CORS blocked');
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
      expect.stringContaining('egis.fire.ca.gov'), expect.anything(), expect.anything(), expect.anything()
    );
    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('services1.arcgis.com'), expect.anything(), expect.anything(), expect.anything()
    );
  });

  it('falls back to data.ca.gov when both ArcGIS sources fail, resolving the resource via CKAN package_show', async () => {
    vi.useFakeTimers();
    fetchWithCache.mockImplementation(async (url) => {
      if (url.includes('egis.fire.ca.gov') || url.includes('services1.arcgis.com')) {
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
});
