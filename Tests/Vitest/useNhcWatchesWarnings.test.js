import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNhcWatchesWarnings } from '../../src/app/hooks/useNhcWatchesWarnings';
import * as nhcTropicalWeather from '../../src/app/api/nhcTropicalWeather';

vi.mock('../../src/app/api/nhcTropicalWeather');

beforeEach(() => {
  vi.restoreAllMocks();
});

const mockWWData = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-80, 25], [-80, 26]] },
      properties: { id: 'nhc-ww-1', wwType: 'Hurricane Warning' },
    },
  ],
};

describe('useNhcWatchesWarnings', () => {
  it('starts with null GeoJSON and loading false when disabled', () => {
    const { result } = renderHook(() => useNhcWatchesWarnings(false));

    expect(result.current.geoJSON).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('fetches watch/warning data when enabled', async () => {
    nhcTropicalWeather.fetchNhcWatchesWarnings.mockResolvedValue(mockWWData);

    const { result } = renderHook(() => useNhcWatchesWarnings(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.geoJSON).toEqual(mockWWData);
  });

  it('handles API errors gracefully', async () => {
    nhcTropicalWeather.fetchNhcWatchesWarnings.mockRejectedValue(new Error('NHC down'));

    const { result } = renderHook(() => useNhcWatchesWarnings(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.geoJSON).toBeNull();
  });

  it('refresh function re-fetches data', async () => {
    nhcTropicalWeather.fetchNhcWatchesWarnings.mockResolvedValue(mockWWData);

    const { result } = renderHook(() => useNhcWatchesWarnings(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = { type: 'FeatureCollection', features: [] };
    nhcTropicalWeather.fetchNhcWatchesWarnings.mockResolvedValue(updated);

    await result.current.refresh();

    await waitFor(() => expect(result.current.geoJSON).toEqual(updated));
  });
});
