import { describe, it, expect } from 'vitest';
import { alertsToGeoJSON, filterFireWeatherAlerts } from '../../src/api/noaaWeather';

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
