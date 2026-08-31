import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWaterGauges } from '../../src/app/hooks/useWaterGauges';
import * as noaaWaterGauge from '../../src/app/api/noaaWaterGauge';

vi.mock('../../src/app/api/noaaWaterGauge');

beforeEach(() => {
  vi.clearAllMocks();
});

const mockGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-122.01, 39.21] },
      properties: { lid: 'CCKC1', currentStage: 52.3, floodCategory: 'minor' },
    },
  ],
};

describe('useWaterGauges', () => {
  it('does not fetch and stays empty when the toggle is off', async () => {
    const { result } = renderHook(() => useWaterGauges(false));

    expect(result.current.geoJSON).toEqual({ type: 'FeatureCollection', features: [] });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(noaaWaterGauge.fetchWaterGauges).not.toHaveBeenCalled();
  });

  it('fetches gauges when the toggle is on', async () => {
    noaaWaterGauge.fetchWaterGauges.mockResolvedValue(mockGeoJSON);

    const { result } = renderHook(() => useWaterGauges(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(noaaWaterGauge.fetchWaterGauges).toHaveBeenCalled();
    expect(result.current.geoJSON).toEqual(mockGeoJSON);
    expect(result.current.error).toBeNull();
  });

  it('fetches once the toggle flips from off to on', async () => {
    noaaWaterGauge.fetchWaterGauges.mockResolvedValue(mockGeoJSON);

    const { result, rerender } = renderHook(({ on }) => useWaterGauges(on), {
      initialProps: { on: false },
    });

    expect(noaaWaterGauge.fetchWaterGauges).not.toHaveBeenCalled();

    rerender({ on: true });

    await waitFor(() => expect(result.current.geoJSON.features).toHaveLength(1));
    expect(noaaWaterGauge.fetchWaterGauges).toHaveBeenCalled();
  });

  it('surfaces an error when the fetch fails', async () => {
    noaaWaterGauge.fetchWaterGauges.mockRejectedValue(new Error('NWPS down'));

    const { result } = renderHook(() => useWaterGauges(true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('NWPS down');
  });

  it('refresh re-fetches the gauge data', async () => {
    noaaWaterGauge.fetchWaterGauges.mockResolvedValue(mockGeoJSON);

    const { result } = renderHook(() => useWaterGauges(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = {
      type: 'FeatureCollection',
      features: [
        ...mockGeoJSON.features,
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { lid: 'X' } },
      ],
    };
    noaaWaterGauge.fetchWaterGauges.mockResolvedValue(updated);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.geoJSON.features).toHaveLength(2);
  });
});
