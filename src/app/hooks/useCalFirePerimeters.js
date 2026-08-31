/**
 * useCalFirePerimeters.js
 * Fetches historical California fire perimeter polygons from CAL FIRE FRAP.
 * Only fetches while `enabled` (the layer toggle) is true.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCalFireHistoricalPerimeters } from '../api/calFirePerimeters';

const REFRESH_MS = 12 * 60 * 60 * 1000; // FRAP data only refreshes ~annually
const EMPTY = { type: 'FeatureCollection', features: [] };

export function useCalFirePerimeters(enabled = false, { minYear, minAcres = 0 } = {}) {
  const [geoJSON, setGeoJSON] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [count, setCount]     = useState(0);
  const mountedRef  = useRef(true);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCalFireHistoricalPerimeters({ minYear, minAcres });
      if (!mountedRef.current) return;
      setGeoJSON(data || EMPTY);
      setCount(data?.features?.length ?? 0);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, minYear, minAcres]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      load();
      intervalRef.current = setInterval(load, REFRESH_MS);
    }
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [enabled, load]);

  return { geoJSON, loading, error, count, refresh: load };
}
