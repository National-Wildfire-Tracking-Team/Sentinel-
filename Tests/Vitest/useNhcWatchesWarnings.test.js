import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNhcTropicalWeather } from '../../src/app/hooks/useNhcTropicalWeather';
import * as nhcTropicalWeather from '../../src/app/api/nhcTropicalWeather';

vi.mock('../../src/app/api/nhcTropicalWeather');

beforeEach(() => {
  vi.clearAllMocks();
});

const mockWWData = {
  forecastPointsGeoJSON: null,
  forecastTrackGeoJSON: null,
  coneGeoJSON: null,
  watchWarningGeoJSON: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-80, 25], [-80, 26]] },
        properties: { id: 'nhc-ww-1', wwType: 'Hurricane Warning' },
      },
    ],
  },
};

describe('useNhcTropicalWeather watch and warning data', () => {
  it('starts with null GeoJSON and loading false when disabled', () => {
    const { result } = renderHook(() => useNhcTropicalWeather(false));

    expect(result.current.watchWarningGeoJSON).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('fetches watch/warning data when enabled', async () => {
    nhcTropicalWeather.fetchNhcTropicalWeather.mockResolvedValue(mockWWData);

    const { result } = renderHook(() => useNhcTropicalWeather(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.watchWarningGeoJSON).toEqual(mockWWData.watchWarningGeoJSON);
  });

  it('handles API errors gracefully', async () => {
    nhcTropicalWeather.fetchNhcTropicalWeather.mockRejectedValue(new Error('NHC down'));

    const { result } = renderHook(() => useNhcTropicalWeather(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.watchWarningGeoJSON).toBeNull();
  });

  it('refresh function re-fetches data', async () => {
    nhcTropicalWeather.fetchNhcTropicalWeather.mockResolvedValue(mockWWData);

    const { result } = renderHook(() => useNhcTropicalWeather(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = {
      ...mockWWData,
      watchWarningGeoJSON: { type: 'FeatureCollection', features: [] },
    };
    nhcTropicalWeather.fetchNhcTropicalWeather.mockResolvedValue(updated);

    await result.current.refresh();

    await waitFor(() => expect(result.current.watchWarningGeoJSON).toEqual(updated.watchWarningGeoJSON));
  });
});
