import { describe, it, expect } from 'vitest';
import { calFireFeatureToIncident, normalizeCalFireIncidents } from '../../src/app/api/calFire';

describe('calFireFeatureToIncident', () => {
  it('converts a valid CAL FIRE feature to incident object', () => {
    const feature = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [-120.5, 37.2],
      },
      properties: {
        Name: 'Test Fire',
        AcresBurned: 1500,
        PercentContained: 45,
        County: 'Fresno',
        Type: 'Wildfire',
        Started: '2025-06-15T10:00:00Z',
        Updated: '2025-06-15T14:00:00Z',
        UniqueId: 'fire-123',
        Url: 'https://example.com',
        AdminUnit: 'CAL FIRE Fresno',
        Location: 'Near Shaver Lake',
      },
    };

    const incident = calFireFeatureToIncident(feature, 0);

    expect(incident.id).toBe('fire-123');
    expect(incident.name).toBe('Test Fire');
    expect(incident.state).toBe('CA');
    expect(incident.county).toBe('Fresno');
    expect(incident.lat).toBe(37.2);
    expect(incident.lng).toBe(-120.5);
    expect(incident.acres).toBe(1500);
    expect(incident.contained).toBe(45);
    expect(incident.status).toBe('active');
    expect(incident.source).toBe('CAL_FIRE');
    expect(incident.cause).toBe('Wildfire');
    expect(incident.url).toBe('https://example.com');
    expect(incident.location_description).toBe('Near Shaver Lake');
    expect(incident.displayLabel).toBe('Test Fire (CAL FIRE Fresno)');
  });

  it('sets status to controlled when contained >= 100', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { Name: 'Contained Fire', PercentContained: 100 },
    };
    expect(calFireFeatureToIncident(feature, 0).status).toBe('controlled');
  });

  it('uses fallback index for id when UniqueId is missing', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { Name: 'No ID Fire' },
    };
    expect(calFireFeatureToIncident(feature, 5).id).toBe('calfire-5');
  });

  it('defaults name to Unknown Fire when Name is missing', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {},
    };
    expect(calFireFeatureToIncident(feature, 0).name).toBe('Unknown Fire');
  });

  it('falls back to Latitude/Longitude properties when geometry is missing', () => {
    const feature = {
      properties: { Name: 'Fallback', Latitude: '34.5', Longitude: '-118.3' },
    };
    const incident = calFireFeatureToIncident(feature, 0);
    expect(incident.lat).toBe(34.5);
    expect(incident.lng).toBe(-118.3);
  });

  it('handles missing properties object', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [-1, 1] },
    };
    const incident = calFireFeatureToIncident(feature, 0);
    expect(incident.name).toBe('Unknown Fire');
    expect(incident.acres).toBe(0);
  });

  it('parses StartedDateOnly when Started is missing', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { StartedDateOnly: '2025-06-15' },
    };
    const incident = calFireFeatureToIncident(feature, 0);
    expect(incident.started).toBeTruthy();
  });

  it('sets null for missing dates', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { Name: 'No Dates' },
    };
    const incident = calFireFeatureToIncident(feature, 0);
    expect(incident.started).toBeNull();
    expect(incident.updated).toBeNull();
  });
});

describe('normalizeCalFireIncidents', () => {
  it('returns empty array for null input', () => {
    expect(normalizeCalFireIncidents(null)).toEqual([]);
  });

  it('returns empty array for empty features', () => {
    expect(normalizeCalFireIncidents({ type: 'FeatureCollection', features: [] })).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(normalizeCalFireIncidents(undefined)).toEqual([]);
  });

  it('filters out non-wildfire types', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { Name: 'Wildfire', Type: 'Wildfire' },
        },
        {
          geometry: { type: 'Point', coordinates: [1, 1] },
          properties: { Name: 'River', Type: 'Flood' },
        },
        {
          geometry: { type: 'Point', coordinates: [2, 2] },
          properties: { Name: 'Unknown Type', Type: '' },
        },
      ],
    };

    const incidents = normalizeCalFireIncidents(geojson);
    expect(incidents).toHaveLength(2);
    expect(incidents[0].name).toBe('Wildfire');
    expect(incidents[1].name).toBe('Unknown Type');
  });

  it('includes features with empty Type (falsy check)', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: { Name: 'No Type' },
        },
      ],
    };
    expect(normalizeCalFireIncidents(geojson)).toHaveLength(1);
  });
});
