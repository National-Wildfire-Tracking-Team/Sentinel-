import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEvacZones } from '../../src/hooks/useEvacZones';

const { fetchCAEvacZones } = vi.hoisted(() => ({
  fetchCAEvacZones: vi.fn(),
}));

vi.mock('../../src/api/caEvacZones', () => ({ fetchCAEvacZones }));

describe('useEvacZones', () => {
  beforeEach(() => {
    fetchCAEvacZones.mockReset();
  });

  it('clears loading and records an error when the fetch throws', async () => {
    fetchCAEvacZones.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useEvacZones(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('network down');
    expect(result.current.geoJSON.features).toEqual([]);
  });

  it('stores GeoJSON on success', async () => {
    const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} }] };
    fetchCAEvacZones.mockResolvedValue(geo);
    const { result } = renderHook(() => useEvacZones(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(null);
    expect(result.current.geoJSON.features).toHaveLength(1);
  });
});
