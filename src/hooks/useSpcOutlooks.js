/**
 * useSpcOutlooks.js
 * Loads SPC Day 1-3 categorical outlook polygons for weather mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpcOutlooks } from '../api/spcOutlooks';

const REFRESH_MS = 5 * 60 * 1000;

export function useSpcOutlooks(enabled = false) {
  const [geoJSON, setGeoJSON] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);
      const merged = await fetchSpcOutlooks();
      if (!mountedRef.current) return;
      setGeoJSON(merged);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load SPC outlooks');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    load();

    if (enabled) intervalRef.current = setInterval(load, REFRESH_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [enabled, load]);

  return {
    geoJSON,
    loading,
    error,
    refresh: load,
  };
}
