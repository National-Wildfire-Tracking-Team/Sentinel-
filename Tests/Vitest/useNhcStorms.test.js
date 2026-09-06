import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNhcTropicalWeather } from '../../src/app/hooks/useNhcTropicalWeather';
import * as nhcTropicalWeather from '../../src/app/api/nhcTropicalWeather';

vi.mock('../../src/app/api/nhcTropicalWeather');

beforeEach(() => {
  vi.clearAllMocks();
});

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

const mockNhcData = {
  forecastPointsGeoJSON: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-75.5, 25.3] },
        properties: { id: 'AL012025', name: 'Hurricane Alpha', classification: 'HU', intensityKts: 100 },
      },
    ],
  },
  forecastTrackGeoJSON: EMPTY_FC,
  coneGeoJSON: EMPTY_FC,
  watchWarningGeoJSON: EMPTY_FC,
  pastPointsGeoJSON: EMPTY_FC,
  pastTrackGeoJSON: EMPTY_FC,
  disturbancePointsGeoJSON: EMPTY_FC,
  disturbanceAreasGeoJSON: EMPTY_FC,
};

describe('useNhcTropicalWeather storm data', () => {
  it('starts with null GeoJSON and loading false when disabled', () => {
    const { result } = renderHook(() => useNhcTropicalWeather(false));

    expect(result.current.forecastPointsGeoJSON).toBeNull();
    expect(result.current.coneGeoJSON).toBeNull();
    expect(result.current.forecastTrackGeoJSON).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('fetches storm data when enabled', async () => {
    nhcTropicalWeather.fetchNhcTropicalWeather.mockResolvedValue(mockNhcData);

    const { result } = renderHook(() => useNhcTropicalWeather(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.forecastPointsGeoJSON).toEqual(mockNhcData.forecastPointsGeoJSON);
    expect(result.current.coneGeoJSON).toEqual(EMPTY_FC);
    expect(result.current.forecastTrackGeoJSON).toEqual(EMPTY_FC);
  });

  it('handles API errors gracefully', async () => {
    nhcTropicalWeather.fetchNhcTropicalWeather.mockRejectedValue(new Error('NHC down'));

    const { result } = renderHook(() => useNhcTropicalWeather(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.forecastPointsGeoJSON).toBeNull();
    expect(result.current.coneGeoJSON).toBeNull();
    expect(result.current.forecastTrackGeoJSON).toBeNull();
  });

  it('does not refetch after being disabled', async () => {
    nhcTropicalWeather.fetchNhcTropicalWeather.mockResolvedValue(mockNhcData);

    const { result, rerender } = renderHook(
      ({ enabled }) => useNhcTropicalWeather(enabled),
      { initialProps: { enabled: true } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.forecastPointsGeoJSON).toEqual(mockNhcData.forecastPointsGeoJSON);

    rerender({ enabled: false });

    expect(nhcTropicalWeather.fetchNhcTropicalWeather).toHaveBeenCalledOnce();
  });

  it('refresh function re-fetches data', async () => {
    nhcTropicalWeather.fetchNhcTropicalWeather.mockResolvedValue(mockNhcData);

    const { result } = renderHook(() => useNhcTropicalWeather(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedData = {
      ...mockNhcData,
      forecastPointsGeoJSON: { type: 'FeatureCollection', features: [] },
    };
    nhcTropicalWeather.fetchNhcTropicalWeather.mockResolvedValue(updatedData);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.forecastPointsGeoJSON.features).toHaveLength(0);
  });
});
