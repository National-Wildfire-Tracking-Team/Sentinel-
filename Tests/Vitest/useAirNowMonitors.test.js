import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAirNowMonitors } from '../../src/app/hooks/useAirNowMonitors';
import * as airnow from '../../src/app/api/airnow';

vi.mock('../../src/app/api/airnow');

beforeEach(() => {
  vi.restoreAllMocks();
});

const mockGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-118.24, 34.05] },
      properties: { siteName: 'Downtown LA', aqi: 42, aqiLabel: 'Good' },
    },
  ],
};

describe('useAirNowMonitors', () => {
  it('starts empty and loading false when disabled', () => {
    const { result } = renderHook(() => useAirNowMonitors(false));

    expect(result.current.geoJSON).toEqual({ type: 'FeatureCollection', features: [] });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches data when enabled', async () => {
    airnow.fetchAirNowMonitors.mockResolvedValue(mockGeoJSON);

    const { result } = renderHook(() => useAirNowMonitors(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.geoJSON).toEqual(mockGeoJSON);
    expect(result.current.error).toBeNull();
    expect(airnow.fetchAirNowMonitors).toHaveBeenCalled();
  });

  it('sets error on fetch failure', async () => {
    airnow.fetchAirNowMonitors.mockRejectedValue(new Error('ArcGIS down'));

    const { result } = renderHook(() => useAirNowMonitors(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('ArcGIS down');
    expect(result.current.geoJSON).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('refresh function re-fetches data', async () => {
    airnow.fetchAirNowMonitors.mockResolvedValue(mockGeoJSON);

    const { result } = renderHook(() => useAirNowMonitors(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedGeoJSON = {
      type: 'FeatureCollection',
      features: [...mockGeoJSON.features, { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }],
    };
    airnow.fetchAirNowMonitors.mockResolvedValue(updatedGeoJSON);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.geoJSON.features).toHaveLength(2);
  });

  it('does not set state after unmount', async () => {
    let resolve;
    airnow.fetchAirNowMonitors.mockImplementation(
      () => new Promise((r) => { resolve = r; })
    );

    const { unmount } = renderHook(() => useAirNowMonitors(true));

    unmount();

    resolve(mockGeoJSON);
  });
});
