import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDroughtOutlook } from '../../src/app/hooks/useDroughtOutlook';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useDroughtOutlook', () => {
  it('fetches drought outlook data on mount', async () => {
    const mockData = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: {}, properties: { outlook: 'Abnormally Dry' } }],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const { result } = renderHook(() => useDroughtOutlook());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.geoJSON).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('does not fetch when disabled', async () => {
    global.fetch = vi.fn();

    const { result } = renderHook(() => useDroughtOutlook(false));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.geoJSON).toEqual(EMPTY_GEOJSON);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sets error on fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useDroughtOutlook());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain('500');
  });

  it('sets error on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDroughtOutlook());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network error');
  });

  it('handles null features in response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useDroughtOutlook());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.geoJSON).toEqual(EMPTY_GEOJSON);
  });

  it('refresh function re-fetches', async () => {
    const mockData = { type: 'FeatureCollection', features: [] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const { result } = renderHook(() => useDroughtOutlook());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedData = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: {}, properties: {} }] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(updatedData),
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.geoJSON.features).toHaveLength(1);
  });
});
