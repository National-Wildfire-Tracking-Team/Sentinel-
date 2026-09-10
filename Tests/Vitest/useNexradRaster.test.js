import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNexradRaster } from '../../src/app/hooks/useNexradRaster';
import * as radarRaster from '../../src/app/utils/radarRaster';

vi.mock('../../src/app/utils/radarRaster');

const SITE = { lat: 28.11305, lng: -80.65444 };
const OTHER_SITE = { lat: 35.3333, lng: -97.4778 };

function payloadFor(tag) {
  return { tag };
}

beforeEach(() => {
  vi.clearAllMocks();
  radarRaster.rasterizeSweep.mockImplementation((payload, site) => ({
    dataUrl: `data:${payload.tag}@${site.lat},${site.lng}`,
    coordinates: [[site.lng, site.lat]],
  }));
});

describe('useNexradRaster', () => {
  it('rasterizes on first render for a given site/product/scanTime', () => {
    const { result } = renderHook(() =>
      useNexradRaster('KTLX', 'reflectivity', 't1', payloadFor('a'), SITE));

    expect(radarRaster.rasterizeSweep).toHaveBeenCalledTimes(1);
    expect(result.current.dataUrl).toBe('data:a@28.11305,-80.65444');
  });

  it('serves a cache hit without calling rasterizeSweep again', () => {
    const { result, rerender } = renderHook(
      ({ scanTime, payload }) => useNexradRaster('KTLX', 'reflectivity', scanTime, payload, SITE),
      { initialProps: { scanTime: 't1', payload: payloadFor('a') } },
    );
    expect(radarRaster.rasterizeSweep).toHaveBeenCalledTimes(1);

    rerender({ scanTime: 't2', payload: payloadFor('b') });
    expect(radarRaster.rasterizeSweep).toHaveBeenCalledTimes(2);

    // Scrub back to t1 — a plain single-slot useMemo would recompute here;
    // the bounded cache should serve it without a third rasterize call.
    rerender({ scanTime: 't1', payload: payloadFor('a') });
    expect(result.current.dataUrl).toBe('data:a@28.11305,-80.65444');
    expect(radarRaster.rasterizeSweep).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry once the cache exceeds its bound', () => {
    const { result, rerender } = renderHook(
      ({ scanTime, payload }) => useNexradRaster('KTLX', 'reflectivity', scanTime, payload, SITE),
      { initialProps: { scanTime: 't0', payload: payloadFor('scan-0') } },
    );

    // Fill the cache well past its bound (20) with distinct scans.
    for (let i = 1; i <= 25; i++) {
      rerender({ scanTime: `t${i}`, payload: payloadFor(`scan-${i}`) });
    }
    const callsAfterFill = radarRaster.rasterizeSweep.mock.calls.length;

    // The very first scan (t0) should have been evicted — revisiting it
    // must call rasterizeSweep again, not serve a stale cache hit.
    rerender({ scanTime: 't0', payload: payloadFor('scan-0') });
    expect(radarRaster.rasterizeSweep).toHaveBeenCalledTimes(callsAfterFill + 1);
    expect(result.current.dataUrl).toBe('data:scan-0@28.11305,-80.65444');

    // But a recently-visited scan (t25, well within the last 20) should
    // still be a cache hit.
    const callsAfterT0Refetch = radarRaster.rasterizeSweep.mock.calls.length;
    rerender({ scanTime: 't25', payload: payloadFor('scan-25') });
    expect(radarRaster.rasterizeSweep).toHaveBeenCalledTimes(callsAfterT0Refetch);
  });

  it('does not serve one site\'s cached raster for another site with the same scanTime', () => {
    const { result, rerender } = renderHook(
      ({ siteId, site }) => useNexradRaster(siteId, 'reflectivity', 'shared-time', payloadFor('same-tag'), site),
      { initialProps: { siteId: 'KTLX', site: SITE } },
    );
    expect(result.current.dataUrl).toBe('data:same-tag@28.11305,-80.65444');

    rerender({ siteId: 'KOKX', site: OTHER_SITE });
    expect(result.current.dataUrl).toBe('data:same-tag@35.3333,-97.4778');
    expect(radarRaster.rasterizeSweep).toHaveBeenCalledTimes(2);
  });

  it('does not serve one product\'s cached raster for another product with the same scanTime', () => {
    const { result, rerender } = renderHook(
      ({ product }) => useNexradRaster('KTLX', product, 'shared-time', payloadFor('shared-payload-tag'), SITE),
      { initialProps: { product: 'reflectivity' } },
    );
    const firstResult = result.current;

    rerender({ product: 'velocity' });
    expect(radarRaster.rasterizeSweep).toHaveBeenCalledTimes(2);
    expect(result.current).not.toBe(firstResult);
  });

  it('returns null when required inputs are missing', () => {
    const { result } = renderHook(() =>
      useNexradRaster(undefined, 'reflectivity', 't1', payloadFor('a'), SITE));
    expect(result.current).toBeNull();
    expect(radarRaster.rasterizeSweep).not.toHaveBeenCalled();
  });
});
