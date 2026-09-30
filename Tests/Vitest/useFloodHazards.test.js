import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchFloodHazardsInBounds = vi.fn();
const peekFloodHazards = vi.fn();

vi.mock('../../src/app/api/femaFloodHazards', () => ({
  EMPTY_FLOOD_DATA: {
    level: null,
    zones: { type: 'FeatureCollection', features: [] },
    panels: { type: 'FeatureCollection', features: [] },
    availability: { type: 'FeatureCollection', features: [] },
    attribution: null,
    truncated: false,
  },
  fetchFloodHazardsInBounds: (...args) => fetchFloodHazardsInBounds(...args),
  peekFloodHazards: (...args) => peekFloodHazards(...args),
}));

const { useFloodHazards, boundsForViewport, FLOOD_DEBOUNCE_MS } = await import('../../src/app/hooks/useFloodHazards');

const DATA = {
  level: 'detail',
  zones: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 1, category: 'pct_1' } }] },
  panels: { type: 'FeatureCollection', features: [] },
  availability: { type: 'FeatureCollection', features: [] },
};

const SACRAMENTO = { longitude: -121.49, latitude: 38.58, zoom: 13 };

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(FLOOD_DEBOUNCE_MS + 10);
  });
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchFloodHazardsInBounds.mockReset().mockResolvedValue(DATA);
  peekFloodHazards.mockReset().mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFloodHazards', () => {
  it('makes no requests while the layer is disabled', async () => {
    const { result, rerender } = renderHook(({ vp }) => useFloodHazards(false, vp), { initialProps: { vp: SACRAMENTO } });
    rerender({ vp: { ...SACRAMENTO, longitude: -121.3 } });
    await settle();
    expect(fetchFloodHazardsInBounds).not.toHaveBeenCalled();
    expect(result.current.data.zones.features).toEqual([]);
  });

  it('loads the visible area once the map settles on initial load', async () => {
    const { result } = renderHook(() => useFloodHazards(true, SACRAMENTO));
    expect(fetchFloodHazardsInBounds).not.toHaveBeenCalled();
    await settle();
    expect(fetchFloodHazardsInBounds).toHaveBeenCalledTimes(1);
    const [bounds, zoom] = fetchFloodHazardsInBounds.mock.calls[0];
    expect(zoom).toBe(13);
    expect(bounds.west).toBeLessThan(SACRAMENTO.longitude);
    expect(bounds.east).toBeGreaterThan(SACRAMENTO.longitude);
    expect(result.current.data).toBe(DATA);
    expect(result.current.loading).toBe(false);
  });

  it('debounces rapid pan/zoom into a single request for the final viewport', async () => {
    const { rerender } = renderHook(({ vp }) => useFloodHazards(true, vp), { initialProps: { vp: SACRAMENTO } });
    for (let i = 1; i <= 20; i++) {
      rerender({ vp: { ...SACRAMENTO, longitude: SACRAMENTO.longitude + i * 0.01, zoom: 13 + i * 0.02 } });
      await act(async () => { vi.advanceTimersByTime(50); });
    }
    await settle();
    expect(fetchFloodHazardsInBounds).toHaveBeenCalledTimes(1);
    expect(fetchFloodHazardsInBounds.mock.calls[0][1]).toBeCloseTo(13.4);
  });

  it('reloads for the new viewport after "go to my location" without touching the toggle', async () => {
    const { rerender } = renderHook(({ enabled, vp }) => useFloodHazards(enabled, vp), {
      initialProps: { enabled: true, vp: SACRAMENTO },
    });
    await settle();
    // MapCornerButtons' locate-me sets viewport to the user's position at zoom 12.
    rerender({ enabled: true, vp: { longitude: -95.37, latitude: 29.76, zoom: 12 } });
    await settle();
    expect(fetchFloodHazardsInBounds).toHaveBeenCalledTimes(2);
    const [bounds] = fetchFloodHazardsInBounds.mock.calls[1];
    expect(bounds.west).toBeLessThan(-95.37);
    expect(bounds.east).toBeGreaterThan(-95.37);
  });

  it('does not fetch after moving to a location while the layer is off', async () => {
    const { rerender } = renderHook(({ vp }) => useFloodHazards(false, vp), { initialProps: { vp: SACRAMENTO } });
    rerender({ vp: { longitude: -95.37, latitude: 29.76, zoom: 12 } });
    await settle();
    expect(fetchFloodHazardsInBounds).not.toHaveBeenCalled();
  });

  it('paints cached data immediately and skips the network when fresh', async () => {
    peekFloodHazards.mockReturnValue({ data: DATA, fresh: true });
    const { result } = renderHook(() => useFloodHazards(true, SACRAMENTO));
    await settle();
    expect(result.current.data).toBe(DATA);
    expect(fetchFloodHazardsInBounds).not.toHaveBeenCalled();
  });

  it('paints stale cached data and refreshes in the background', async () => {
    const newer = { ...DATA, level: 'detail', zones: { type: 'FeatureCollection', features: [] } };
    peekFloodHazards.mockReturnValue({ data: DATA, fresh: false });
    fetchFloodHazardsInBounds.mockResolvedValue(newer);
    const { result } = renderHook(() => useFloodHazards(true, SACRAMENTO));
    await settle();
    expect(fetchFloodHazardsInBounds).toHaveBeenCalledWith(expect.any(Object), 13, { force: true });
    expect(result.current.data).toBe(newer);
  });

  it('reports below-min-zoom without requesting anything', async () => {
    const { result } = renderHook(() => useFloodHazards(true, { ...SACRAMENTO, zoom: 5 }));
    await settle();
    expect(result.current.belowMinZoom).toBe(true);
    expect(fetchFloodHazardsInBounds).not.toHaveBeenCalled();
  });

  it('keeps the last data on screen when a request fails, and retry recovers', async () => {
    const { result, rerender } = renderHook(({ vp }) => useFloodHazards(true, vp), { initialProps: { vp: SACRAMENTO } });
    await settle();
    fetchFloodHazardsInBounds.mockRejectedValueOnce(new Error('Flood hazard data is temporarily unavailable.'));
    rerender({ vp: { ...SACRAMENTO, longitude: -121.3 } });
    await settle();
    expect(result.current.error).toBe('Flood hazard data is temporarily unavailable.');
    expect(result.current.data).toBe(DATA);

    await act(async () => { result.current.retry(); });
    expect(fetchFloodHazardsInBounds).toHaveBeenLastCalledWith(expect.any(Object), 13, { force: true });
    expect(result.current.error).toBeNull();
  });

  it('clears polygons and ignores in-flight results when toggled off', async () => {
    let resolve;
    fetchFloodHazardsInBounds.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, rerender } = renderHook(({ enabled }) => useFloodHazards(enabled, SACRAMENTO), { initialProps: { enabled: true } });
    await settle();
    rerender({ enabled: false });
    await act(async () => { resolve(DATA); });
    expect(result.current.data.zones.features).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe('boundsForViewport', () => {
  it('covers the visible area plus a buffer, wider at lower zoom', () => {
    const size = { width: 1000, height: 800 };
    const near = boundsForViewport({ longitude: -100, latitude: 40, zoom: 14 }, size);
    const far = boundsForViewport({ longitude: -100, latitude: 40, zoom: 10 }, size);
    // 1000px * 1.3 buffer at z14 with 512px tiles
    expect(near.east - near.west).toBeCloseTo((1300 / (512 * 2 ** 14)) * 360, 6);
    expect(far.east - far.west).toBeGreaterThan((near.east - near.west) * 15);
    expect(near.north).toBeGreaterThan(40);
    expect(near.south).toBeLessThan(40);
  });

  it('returns null for an incomplete viewport', () => {
    expect(boundsForViewport({ longitude: -100 })).toBeNull();
  });
});
