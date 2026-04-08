/**
 * useFireHotspots.js
 * Custom hook that fetches and refreshes NASA FIRMS fire hotspot data.
 * Returns GeoJSON-ready data and loading/error state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFireHotspots, hotspotsToGeoJSON } from '../api/nasaFirms';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

export function useFireHotspots(bounds) {
  const [geoJSON, setGeoJSON]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(null);
  const [count,   setCount]     = useState(0);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const spots = await fetchFireHotspots(bounds);
      if (!mountedRef.current) return;
      setGeoJSON(hotspotsToGeoJSON(spots));
      setCount(spots.length);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [bounds]);

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
