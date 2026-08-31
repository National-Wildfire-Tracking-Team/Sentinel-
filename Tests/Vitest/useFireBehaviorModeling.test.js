import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFireBehaviorModeling } from '../../src/app/hooks/useFireBehaviorModeling';
import * as raws from '../../src/app/api/raws';

vi.mock('../../src/app/api/raws');

beforeEach(() => {
  vi.restoreAllMocks();
  raws.fetchRAWSStations.mockResolvedValue({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-118.5, 34.2] },
        properties: { windSpeed: 20, windDir: 270, fuelMoisture: 6, stationName: 'Test RAWS' },
      },
    ],
  });
});

const PERIMETER_FIRE_ID = 'perimeter-fire-1';
const DOT_FIRE_ID = 'dot-fire-1';

const combinedFireFeatures = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-118.51, 34.19], [-118.51, 34.21], [-118.49, 34.21], [-118.49, 34.19], [-118.51, 34.19]]],
      },
      properties: { UniqueFireIdentifier: PERIMETER_FIRE_ID, IncidentName: 'Perimeter Fire', PercentContained: 10, GISAcres: 500 },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-118.6, 34.3] },
      properties: { UniqueFireIdentifier: DOT_FIRE_ID, IncidentName: 'Dot Fire', PercentContained: 0, GISAcres: 50 },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-118.7, 34.4] },
      properties: { UniqueFireIdentifier: 'contained-fire', IncidentName: 'Contained Fire', PercentContained: 100, GISAcres: 500 },
    },
  ],
};

describe('useFireBehaviorModeling (unified fire-features input)', () => {
  it('returns empty GeoJSON when disabled', () => {
    const { result } = renderHook(() => useFireBehaviorModeling(false, combinedFireFeatures, PERIMETER_FIRE_ID));
    expect(result.current.geoJSON.features).toEqual([]);
  });

  it('returns empty GeoJSON when no fire is selected', () => {
    const { result } = renderHook(() => useFireBehaviorModeling(true, combinedFireFeatures, null));
    expect(result.current.geoJSON.features).toEqual([]);
  });

  it('grows a mapped Polygon feature from the combined layer into perimeter-based projection rings', async () => {
    const { result } = renderHook(() => useFireBehaviorModeling(true, combinedFireFeatures, PERIMETER_FIRE_ID));

    await waitFor(() => expect(result.current.geoJSON.features.length).toBeGreaterThan(0));

    for (const feature of result.current.geoJSON.features) {
      expect(feature.geometry.type).toBe('Polygon');
      expect(feature.properties.incidentName).toBe('Perimeter Fire');
      expect([1, 3, 6]).toContain(feature.properties.horizonHours);
    }
  });

  it('models a Point (dot-only) feature from the same combined layer as a point ignition', async () => {
    const { result } = renderHook(() => useFireBehaviorModeling(true, combinedFireFeatures, DOT_FIRE_ID));

    await waitFor(() => expect(result.current.geoJSON.features.length).toBeGreaterThan(0));

    for (const feature of result.current.geoJSON.features) {
      expect(feature.geometry.type).toBe('Polygon'); // projected spread ring, not the raw dot
      expect(feature.properties.incidentName).toBe('Dot Fire');
    }
  });

  it('does not model a fire that is 100% contained', async () => {
    const { result } = renderHook(() => useFireBehaviorModeling(true, combinedFireFeatures, 'contained-fire'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.geoJSON.features).toEqual([]);
  });

  it('does not model a fire id that is not present in the combined layer', async () => {
    const { result } = renderHook(() => useFireBehaviorModeling(true, combinedFireFeatures, 'not-a-real-fire'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.geoJSON.features).toEqual([]);
  });
});
