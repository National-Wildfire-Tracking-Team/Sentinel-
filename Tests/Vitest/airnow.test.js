import { describe, it, expect } from 'vitest';
import { aqiToGeoJSON } from '../../src/app/api/airnow';

describe('aqiToGeoJSON', () => {
  it('converts station array to GeoJSON FeatureCollection', () => {
    const stations = [
      {
        id: 'aqi-1',
        latitude: 34.05,
        longitude: -118.25,
        aqi: 42,
        category: 'Good',
        pm25: 12,
        reportingArea: 'Los Angeles',
      },
      {
        id: 'aqi-2',
        latitude: 37.77,
        longitude: -122.42,
        aqi: 85,
        category: 'Moderate',
        pm25: 28,
        reportingArea: 'San Francisco',
      },
    ];

    const geojson = aqiToGeoJSON(stations);

    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(2);

    expect(geojson.features[0].type).toBe('Feature');
    expect(geojson.features[0].geometry.type).toBe('Point');
    expect(geojson.features[0].geometry.coordinates).toEqual([-118.25, 34.05]);
    expect(geojson.features[0].properties.id).toBe('aqi-1');
    expect(geojson.features[0].properties.aqi).toBe(42);
    expect(geojson.features[0].properties.category).toBe('Good');
  });

  it('returns empty FeatureCollection for empty array', () => {
    const geojson = aqiToGeoJSON([]);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(0);
  });

  it('handles stations with zero values', () => {
    const stations = [
      { id: 'aqi-0', latitude: 0, longitude: 0, aqi: 0, category: 'Good', pm25: 0, reportingArea: '' },
    ];
    const geojson = aqiToGeoJSON(stations);
    expect(geojson.features[0].geometry.coordinates).toEqual([0, 0]);
    expect(geojson.features[0].properties.aqi).toBe(0);
  });
});
