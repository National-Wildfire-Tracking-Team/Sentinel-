/**
 * FEMA National Flood Hazard Layer for the current viewport.
 *
 * Driven purely by the shared map viewport, so anything that moves the map —
 * panning, "go to my location", opening a saved location, address search —
 * loads flood data for wherever the map lands, and nothing here ever turns
 * the layer on by itself.
 *
 * Requests are debounced until the map settles, snapped to the proxy's tile
 * grid (see femaFloodHazards.js), and answered from the client cache first:
 * cached areas paint immediately and only refetch in the background once
 * they're stale. The last good data stays on screen while a new area loads
 * or if a request fails, so the layer never flashes empty.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  EMPTY_FLOOD_DATA,
  fetchFloodHazardsInBounds,
  peekFloodHazards,
} from '../api/femaFloodHazards';
import { FLOOD_MIN_ZOOM } from '../utils/floodHazard';

export const FLOOD_DEBOUNCE_MS = 500;
// Fraction of the viewport added on every side, so small pans stay inside
// data that's already loaded.
const BUFFER_RATIO = 0.15;
const FALLBACK_VIEWPORT = { width: 1280, height: 800 };

function viewportSize() {
  if (typeof window === 'undefined') return FALLBACK_VIEWPORT;
  return {
    width: window.innerWidth || FALLBACK_VIEWPORT.width,
    height: window.innerHeight || FALLBACK_VIEWPORT.height,
  };
}

function mercatorY(lat) {
  const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function inverseMercatorY(y) {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

/**
 * Visible bounds (plus buffer) for a Mapbox GL viewport. Mapbox uses 512px
 * tiles, so the world is 512·2^zoom px wide. Pitch/bearing are ignored — the
 * buffer covers modest tilt, and a steeply pitched horizon is exactly where
 * detailed polygons would be wasted anyway.
 */
export function boundsForViewport(viewport, size = viewportSize()) {
  const { longitude, latitude, zoom } = viewport || {};
  if (![longitude, latitude, zoom].every(Number.isFinite)) return null;
  const worldPx = 512 * 2 ** zoom;
  const w = size.width * (1 + 2 * BUFFER_RATIO);
  const h = size.height * (1 + 2 * BUFFER_RATIO);
  const lngSpan = (w / worldPx) * 360;
  const yCenter = mercatorY(latitude);
  const ySpan = (h / worldPx) * 2 * Math.PI;
  return {
    west: Math.max(-180, longitude - lngSpan / 2),
    east: Math.min(180, longitude + lngSpan / 2),
    north: Math.min(85, inverseMercatorY(yCenter + ySpan / 2)),
    south: Math.max(-85, inverseMercatorY(yCenter - ySpan / 2)),
  };
}

/**
 * @param {boolean} enabled Flood Hazard layer toggled on
 * @param {object|null} viewport ViewportContext viewport
 * @returns {{
 *   data: typeof EMPTY_FLOOD_DATA,
 *   loading: boolean,
 *   error: string|null,
 *   belowMinZoom: boolean,
 *   retry: () => void,
 *   refresh: () => void,
 * }}
 */
export function useFloodHazards(enabled, viewport) {
  const [data, setData] = useState(EMPTY_FLOOD_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);
  // Latest viewport for load(), which fires from a debounce timer or a Retry
  // click. Declared before the debounce effect so it's current by then.
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const zoom = viewport?.zoom;
  const belowMinZoom = Boolean(enabled) && Number.isFinite(zoom) && zoom < FLOOD_MIN_ZOOM;

  const load = useCallback(async ({ force = false } = {}) => {
    const vp = viewportRef.current;
    const bounds = boundsForViewport(vp);
    if (!bounds || !(vp.zoom >= FLOOD_MIN_ZOOM)) return;

    const seq = ++seqRef.current;

    // Paint whatever's cached for this area right away.
    const cached = force ? null : peekFloodHazards(bounds, vp.zoom);
    if (cached) {
      setData(cached.data);
      setError(null);
      if (cached.fresh) {
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const next = await fetchFloodHazardsInBounds(bounds, vp.zoom, { force: force || Boolean(cached) });
      if (seq !== seqRef.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (seq !== seqRef.current) return;
      console.warn('[FloodHazards]', err.message);
      setError(err.message || 'Flood hazard data is temporarily unavailable.');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!enabled || belowMinZoom) {
      // Invalidate anything in flight and drop polygons — off means off, and
      // below the minimum zoom there's nothing useful to draw.
      seqRef.current += 1;
      setData(EMPTY_FLOOD_DATA);
      setLoading(false);
      setError(null);
      return undefined;
    }

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      load();
    }, FLOOD_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, belowMinZoom, load, viewport?.longitude, viewport?.latitude, zoom]);

  const retry = useCallback(() => load({ force: true }), [load]);
  const refresh = useCallback(() => {
    if (enabled && !belowMinZoom) load({ force: true });
  }, [enabled, belowMinZoom, load]);

  return { data, loading, error, belowMinZoom, retry, refresh };
}
