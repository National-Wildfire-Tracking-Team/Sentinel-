import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCalFirePerimeters } from '../../src/app/hooks/useCalFirePerimeters';
import * as calFirePerimeters from '../../src/app/api/calFirePerimeters';

vi.mock('../../src/app/api/calFirePerimeters');

beforeEach(() => {
  vi.restoreAllMocks();
});

const mockGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-121, 39], [-121, 40], [-120, 40], [-120, 39], [-121, 39]]] },
      properties: { FireName: 'Camp', FireYear: 2018, GISAcres: 153336 },
    },
  ],
};

describe('useCalFirePerimeters', () => {
  it('does not fetch when disabled', () => {
    renderHook(() => useCalFirePerimeters(false));
    expect(calFirePerimeters.fetchCalFireHistoricalPerimeters).not.toHaveBeenCalled();
  });

  it('fetches perimeters on mount when enabled', async () => {
    calFirePerimeters.fetchCalFireHistoricalPerimeters.mockResolvedValue(mockGeoJSON);

    const { result } = renderHook(() => useCalFirePerimeters(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.geoJSON).toEqual(mockGeoJSON);
    expect(result.current.count).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    calFirePerimeters.fetchCalFireHistoricalPerimeters.mockRejectedValue(new Error('ArcGIS timeout'));

    const { result } = renderHook(() => useCalFirePerimeters(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('ArcGIS timeout');
  });

  it('passes minYear and minAcres through to the API', async () => {
    calFirePerimeters.fetchCalFireHistoricalPerimeters.mockResolvedValue({ type: 'FeatureCollection', features: [] });

    renderHook(() => useCalFirePerimeters(true, { minYear: 2015, minAcres: 1000 }));

    await waitFor(() =>
      expect(calFirePerimeters.fetchCalFireHistoricalPerimeters).toHaveBeenCalledWith({ minYear: 2015, minAcres: 1000 })
    );
  });

  it('refresh function re-fetches data', async () => {
    calFirePerimeters.fetchCalFireHistoricalPerimeters.mockResolvedValue(mockGeoJSON);

    const { result } = renderHook(() => useCalFirePerimeters(true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(1);

    calFirePerimeters.fetchCalFireHistoricalPerimeters.mockResolvedValue({ type: 'FeatureCollection', features: [] });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.count).toBe(0);
  });
});
