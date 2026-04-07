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

  const load = useCallback(async () => {
    try {
      setError(null);
      const spots = await fetchFireHotspots(bounds);
      setGeoJSON(hotspotsToGeoJSON(spots));
      setCount(spots.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [bounds]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  return { geoJSON, loading, error, count, refresh: load };
}
