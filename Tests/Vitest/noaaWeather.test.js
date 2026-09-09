import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  alertsToGeoJSON,
  filterFireWeatherAlerts,
  enrichAlertsWithGeometry,
  isValidZoneId,
} from '../../src/app/api/noaaWeather';

describe('filterFireWeatherAlerts', () => {
  it('keeps only Red Flag Warnings and Fire Weather Watches', () => {
    const alerts = [
      { id: 'red-flag', type: 'Red Flag Warning' },
      { id: 'fire-watch', type: 'Fire Weather Watch' },
      { id: 'tornado', type: 'Tornado Warning' },
      { id: 'flood', type: 'Flood Watch' },
    ];

    expect(filterFireWeatherAlerts(alerts).map(alert => alert.id)).toEqual([
      'red-flag',
      'fire-watch',
    ]);
  });
});

describe('alertsToGeoJSON', () => {
  it('converts alerts with geometry to GeoJSON FeatureCollection', () => {
    const alerts = [
      {
        id: 'alert-1',
        type: 'Tornado Warning',
        headline: 'Tornado Warning for County',
        severity: 'Extreme',
        expires: '2025-06-16T00:00:00Z',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-120, 37],
              [-119, 37],
              [-119, 38],
              [-120, 38],
              [-120, 37],
            ],
          ],
        },
      },
    ];

    const geojson = alertsToGeoJSON(alerts);

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.type).toBe('Polygon');
    expect(geojson.features[0].properties.id).toBe('alert-1');
    expect(geojson.features[0].properties.type).toBe('Tornado Warning');
  });

  it('filters out alerts without geometry', () => {
    const alerts = [
      {
        id: 'alert-1',
        type: 'Tornado Warning',
        headline: 'Warning',
        severity: 'Extreme',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      },
      {
        id: 'alert-2',
        type: 'Tornado Watch',
        headline: 'Watch',
        severity: 'Severe',
        geometry: null,
      },
    ];

    const geojson = alertsToGeoJSON(alerts);
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].properties.id).toBe('alert-1');
  });

  it('returns empty FeatureCollection for empty array', () => {
    const geojson = alertsToGeoJSON([]);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(0);
  });

  it('handles MultiPolygon geometry', () => {
    const alerts = [
      {
        id: 'alert-1',
        type: 'Flood Warning',
        headline: 'Flood',
        severity: 'Moderate',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
          ],
        },
      },
    ];

    const geojson = alertsToGeoJSON(alerts);
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry.type).toBe('MultiPolygon');
  });
});

describe('isValidZoneId', () => {
  it('accepts well-formed UGC zone/county codes', () => {
    expect(isValidZoneId('CAZ006')).toBe(true);
    expect(isValidZoneId('GAZ125')).toBe(true);
    expect(isValidZoneId('TXC201')).toBe(true);
  });

  it('rejects malformed or non-UGC values', () => {
    expect(isValidZoneId('CAZ6')).toBe(false); // not zero-padded
    expect(isValidZoneId('CA-006')).toBe(false);
    expect(isValidZoneId('')).toBe(false);
    expect(isValidZoneId(null)).toBe(false);
    expect(isValidZoneId(undefined)).toBe(false);
    expect(isValidZoneId(123)).toBe(false);
  });
});

describe('enrichAlertsWithGeometry', () => {
  const zoneGeometry = {
    type: 'Polygon',
    coordinates: [[[-84, 33], [-83, 33], [-83, 34], [-84, 34], [-84, 33]]],
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the catalog type reported by the alert\'s affectedZones URL, not a guess', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ properties: { id: 'GAZ125' }, geometry: zoneGeometry }),
    });

    const alerts = [
      {
        id: 'fire-wx-1',
        geometry: null,
        geocode: { UGC: ['GAZ125'] },
        affectedZones: ['https://api.weather.gov/zones/fire/GAZ125'],
      },
    ];

    const result = await enrichAlertsWithGeometry(alerts);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://api.weather.gov/zones/fire/GAZ125');
    expect(result[0].geometry).toEqual(zoneGeometry);
  });

  it('never requests a malformed zone id', async () => {
    const alerts = [
      { id: 'bad-1', geometry: null, geocode: { UGC: ['NOT-A-ZONE'] }, affectedZones: [] },
    ];

    const result = await enrichAlertsWithGeometry(alerts);

    expect(fetch).not.toHaveBeenCalled();
    expect(result[0].geometry).toBeNull();
  });

  it('skips codes already resolved from bulk zone/county/CWA reference data', async () => {
    const alerts = [
      {
        id: 'skip-1',
        geometry: null,
        geocode: { UGC: ['CAZ006'] },
        affectedZones: ['https://api.weather.gov/zones/forecast/CAZ006'],
      },
    ];

    await enrichAlertsWithGeometry(alerts, new Set(['CAZ006']));

    expect(fetch).not.toHaveBeenCalled();
  });

  it('caches a 404 and does not retry the same zone on the next call', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 });

    const alerts = [
      {
        id: 'dead-zone-1',
        geometry: null,
        geocode: { UGC: ['XXZ999'] },
        affectedZones: ['https://api.weather.gov/zones/forecast/XXZ999'],
      },
    ];

    await enrichAlertsWithGeometry(alerts);
    expect(fetch).toHaveBeenCalledTimes(1);

    await enrichAlertsWithGeometry(alerts);
    expect(fetch).toHaveBeenCalledTimes(1); // still 1 — cooldown suppressed the retry
  });

  it('deduplicates a code shared by multiple alerts into a single request', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ properties: { id: 'ORZ001' }, geometry: zoneGeometry }),
    });

    const alerts = [
      {
        id: 'dup-1',
        geometry: null,
        geocode: { UGC: ['ORZ001'] },
        affectedZones: ['https://api.weather.gov/zones/forecast/ORZ001'],
      },
      {
        id: 'dup-2',
        geometry: null,
        geocode: { UGC: ['ORZ001'] },
        affectedZones: ['https://api.weather.gov/zones/forecast/ORZ001'],
      },
    ];

    const result = await enrichAlertsWithGeometry(alerts);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result[0].geometry).toEqual(zoneGeometry);
    expect(result[1].geometry).toEqual(zoneGeometry);
  });
});
