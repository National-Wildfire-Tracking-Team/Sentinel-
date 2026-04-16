/**
 * useCaPerimeters.js
 * Fetches California fire perimeter polygons from the NIFC FIRIS service.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCaPerimeters } from '../api/caPerimeters';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

export function useCaPerimeters() {
  const [geoJSON,  setGeoJSON]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [count,    setCount]    = useState(0);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchCaPerimeters();
      if (!mountedRef.current) return;
      setGeoJSON(data);
      setCount(data?.features?.length ?? 0);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn('[CA FIRIS] Failed to load CA perimeters:', err.message);
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load]);

  return { geoJSON, loading, error, count, refresh: load };
}
