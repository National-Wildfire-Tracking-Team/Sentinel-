/**
 * useFirePerimeters.js
 * Fetches active fire perimeter polygons from NIFC WFIGS.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFirePerimeters } from '../api/nifc';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

export function useFirePerimeters(minAcres = 100) {
  const [geoJSON,  setGeoJSON]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [count,    setCount]    = useState(0);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchFirePerimeters({ minAcres });
      setGeoJSON(data);
      setCount(data?.features?.length ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [minAcres]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  return { geoJSON, loading, error, count, refresh: load };
}
