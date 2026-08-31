import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNhcStorms } from '../../src/app/hooks/useNhcStorms';
import * as nhcStorms from '../../src/app/api/nhcStorms';

vi.mock('../../src/app/api/nhcStorms');

beforeEach(() => {
  vi.restoreAllMocks();
});

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

const mockNhcData = {
  centers: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-75.5, 25.3] },
        properties: { id: 'AL012025', name: 'Hurricane Alpha', classification: 'HU', intensityKts: 100 },
      },
    ],
  },
  cones: EMPTY_FC,
  tracks: EMPTY_FC,
};

describe('useNhcStorms', () => {
  it('starts with null GeoJSON and loading false when disabled', () => {
    const { result } = renderHook(() => useNhcStorms(false));

    expect(result.current.centersGeoJSON).toBeNull();
    expect(result.current.conesGeoJSON).toBeNull();
    expect(result.current.tracksGeoJSON).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('fetches storm data when enabled', async () => {
    nhcStorms.fetchAllNhcData.mockResolvedValue(mockNhcData);

    const { result } = renderHook(() => useNhcStorms(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.centersGeoJSON).toEqual(mockNhcData.centers);
    expect(result.current.conesGeoJSON).toEqual(EMPTY_FC);
    expect(result.current.tracksGeoJSON).toEqual(EMPTY_FC);
  });

  it('handles API errors gracefully', async () => {
    nhcStorms.fetchAllNhcData.mockRejectedValue(new Error('NHC down'));

    const { result } = renderHook(() => useNhcStorms(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.centersGeoJSON).toBeNull();
    expect(result.current.conesGeoJSON).toBeNull();
    expect(result.current.tracksGeoJSON).toBeNull();
  });

  it('nullifies data when disabled after being enabled', async () => {
    nhcStorms.fetchAllNhcData.mockResolvedValue(mockNhcData);

    const { result, rerender } = renderHook(
      ({ enabled }) => useNhcStorms(enabled),
      { initialProps: { enabled: true } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.centersGeoJSON).toEqual(mockNhcData.centers);

    rerender({ enabled: false });

    await waitFor(() => {
      expect(result.current.centersGeoJSON).toBeNull();
    });
  });

  it('refresh function re-fetches data', async () => {
    nhcStorms.fetchAllNhcData.mockResolvedValue(mockNhcData);

    const { result } = renderHook(() => useNhcStorms(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedData = {
      ...mockNhcData,
      centers: { type: 'FeatureCollection', features: [] },
    };
    nhcStorms.fetchAllNhcData.mockResolvedValue(updatedData);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.centersGeoJSON.features).toHaveLength(0);
  });
});
