import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchClosuresInBounds, closuresItemsToGeoJSON } from '../api/osmRoadClosures';

const EMPTY = { type: 'FeatureCollection', features: [] };

/**
 * Load OSM temporary road closures for the current map bounds (wildfire + weather tabs).
 * @param {boolean} enabled
 * @param {{ west: number; south: number; east: number; north: number } | null} bounds
 * @param {number} [refreshToken] – increment to force a refetch
 */
export function useOsmRoadClosures(enabled, bounds, refreshToken = 0) {
  const [geoJSON, setGeoJSON] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  const boundsKey = useMemo(() => {
    if (!bounds) return '';
    const w = bounds.west.toFixed(2);
    const s = bounds.south.toFixed(2);
    const e = bounds.east.toFixed(2);
    const n = bounds.north.toFixed(2);
    return `${w},${s},${e},${n}`;
  }, [bounds]);

  const refresh = useCallback(async () => {
    if (!enabled || !bounds) {
      setGeoJSON(EMPTY);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const { items, skipped } = await fetchClosuresInBounds(bounds, { size: 250 });
      if (seq.current !== id) return;
      if (skipped) {
        setGeoJSON(EMPTY);
        setError(null);
        return;
      }
      setGeoJSON(closuresItemsToGeoJSON(items));
    } catch (err) {
      if (seq.current !== id) return;
      setGeoJSON(EMPTY);
      setError(err?.message || 'Failed to load road closures');
    } finally {
      if (seq.current === id) setLoading(false);
    }
  }, [enabled, bounds]);

  useEffect(() => {
    if (!enabled || !bounds) {
      setGeoJSON(EMPTY);
      setError(null);
      setLoading(false);
      return undefined;
    }
    const t = setTimeout(() => {
      refresh();
    }, 350);
    return () => clearTimeout(t);
  }, [enabled, boundsKey, refresh, bounds, refreshToken]);

  return { geoJSON, loading, error, refresh };
}
