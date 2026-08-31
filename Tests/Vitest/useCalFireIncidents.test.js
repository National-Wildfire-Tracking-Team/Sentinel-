import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCalFireIncidents } from '../../src/app/hooks/useCalFireIncidents';
import * as calFire from '../../src/app/api/calFire';

vi.mock('../../src/app/api/calFire');

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const mockGeojson = {
  type: 'FeatureCollection',
  features: [
    {
      geometry: { type: 'Point', coordinates: [-120.5, 37.2] },
      properties: { Name: 'Test Fire', AcresBurned: 1500, PercentContained: 45, Type: 'Wildfire' },
    },
  ],
};

describe('useCalFireIncidents', () => {
  it('fetches and normalizes incidents on mount', async () => {
    calFire.fetchCalFireGeoJsonList.mockResolvedValue(mockGeojson);
    calFire.normalizeCalFireIncidents.mockReturnValue([
      { id: '1', name: 'Test Fire', acres: 1500, lat: 37.2, lng: -120.5 },
    ]);

    const { result } = renderHook(() => useCalFireIncidents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.incidents).toHaveLength(1);
    expect(result.current.incidents[0].name).toBe('Test Fire');
    expect(result.current.count).toBe(1);
    expect(calFire.fetchCalFireGeoJsonList).toHaveBeenCalledWith({ includeInactive: false });
  });

  it('does not fetch when disabled', async () => {
    calFire.fetchCalFireGeoJsonList.mockClear();
    calFire.fetchCalFireGeoJsonList.mockResolvedValue(mockGeojson);

    const { result } = renderHook(() => useCalFireIncidents(false, false));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.incidents).toEqual([]);
    expect(calFire.fetchCalFireGeoJsonList).not.toHaveBeenCalled();
  });

  it('passes includeInactive through to API', async () => {
    calFire.fetchCalFireGeoJsonList.mockResolvedValue({ type: 'FeatureCollection', features: [] });
    calFire.normalizeCalFireIncidents.mockReturnValue([]);

    const { result } = renderHook(() => useCalFireIncidents(true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calFire.fetchCalFireGeoJsonList).toHaveBeenCalledWith({ includeInactive: true });
  });

  it('sorts incidents by acres descending', async () => {
    calFire.fetchCalFireGeoJsonList.mockResolvedValue(mockGeojson);
    calFire.normalizeCalFireIncidents.mockReturnValue([
      { id: '1', name: 'Small', acres: 100 },
      { id: '2', name: 'Large', acres: 5000 },
      { id: '3', name: 'Medium', acres: 1000 },
    ]);

    const { result } = renderHook(() => useCalFireIncidents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.incidents[0].name).toBe('Large');
    expect(result.current.incidents[1].name).toBe('Medium');
    expect(result.current.incidents[2].name).toBe('Small');
  });

  it('handles API errors gracefully (treats as empty)', async () => {
    calFire.fetchCalFireGeoJsonList.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCalFireIncidents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.incidents).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('refresh function re-fetches data', async () => {
    calFire.fetchCalFireGeoJsonList.mockResolvedValue(mockGeojson);
    calFire.normalizeCalFireIncidents.mockReturnValue([{ id: '1', name: 'Test', acres: 100 }]);

    const { result } = renderHook(() => useCalFireIncidents());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.incidents).toHaveLength(1);

    calFire.normalizeCalFireIncidents.mockReturnValue([
      { id: '1', name: 'Test', acres: 100 },
      { id: '2', name: 'New', acres: 200 },
    ]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.incidents).toHaveLength(2);
  });
});
