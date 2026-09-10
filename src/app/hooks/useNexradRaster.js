/**
 * useNexradRaster.js
 * Bounded LRU cache of rasterized NEXRAD sweeps, keyed by site|product|scanTime
 * — the same key scheme useNexradScan's own payload cache uses.
 *
 * Rasterization (src/app/utils/radarRaster.js) is the most expensive
 * synchronous step in the NEXRAD pipeline (tens of milliseconds of canvas
 * work). useNexradScan's payload cache already lets a revisited scan skip
 * the network fetch + decompress + decode, and a plain `useMemo` keyed on
 * that payload's object reference lets it skip re-rasterizing too — but
 * only for the single most-recently-rasterized scan. Scrubbing A -> B -> A
 * still re-rasterizes A a second time, because by the time B has been
 * rasterized, useMemo has forgotten A's result. This hook remembers the
 * last RASTER_CACHE_SIZE distinct rasterizations instead of just one.
 *
 * The cache lives in a ref, so reading/writing it happens in a
 * `useLayoutEffect` rather than directly in a `useMemo` body — React's render
 * phase must stay pure, and mutating ref.current is only safe from an effect
 * or event handler. `useLayoutEffect` (not `useEffect`) is used specifically
 * so the swap happens synchronously before the browser paints, avoiding a
 * one-frame flash of the previous raster.
 */

import { useRef, useState, useLayoutEffect } from 'react';
import { rasterizeSweep } from '../utils/radarRaster';

// Matches useNexradScan's SCAN_CACHE_SIZE so a full scrub across the whole
// cached payload window never needs to re-rasterize anything.
const RASTER_CACHE_SIZE = 20;

/**
 * @param {string|undefined} siteId
 * @param {'reflectivity'|'velocity'|undefined} product
 * @param {string|undefined} scanTime - meta.scan_time for the currently-selected scan
 * @param {object|null} payload - decoded scan payload (from useNexradScan)
 * @param {{lat: number, lng: number}|null} site
 * @returns {{ dataUrl: string, coordinates: [number, number][] } | null}
 */
export function useNexradRaster(siteId, product, scanTime, payload, site) {
  const cacheRef = useRef(new Map());
  const [raster, setRaster] = useState(null);

  useLayoutEffect(() => {
    if (!siteId || !product || !scanTime || !payload || site?.lat == null || site?.lng == null) {
      setRaster(null);
      return;
    }

    const key = `${siteId}|${product}|${scanTime}`;
    const cache = cacheRef.current;
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key); // refresh recency
      cache.set(key, cached);
      setRaster(cached);
      return;
    }

    const computed = rasterizeSweep(payload, site);
    if (computed) {
      cache.set(key, computed);
      while (cache.size > RASTER_CACHE_SIZE) {
        cache.delete(cache.keys().next().value);
      }
    }
    setRaster(computed);
    // `site` is intentionally omitted below: siteId/product/scanTime/payload
    // are the real cache identity, and `site` is a fresh object literal from
    // the caller every render — only its content (read on a cache miss)
    // matters, and that content only ever changes when siteId does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, product, scanTime, payload]);

  return raster;
}
