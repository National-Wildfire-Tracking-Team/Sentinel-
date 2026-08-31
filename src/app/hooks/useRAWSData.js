/**
 * useRAWSData.js
 * Custom hook for RAWS (Remote Automated Weather Stations) data.
 * Refreshes every 15 minutes; supports manual refresh.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchRAWSStations } from '../api/raws';

const REFRESH_MS = 15 * 60 * 1000;

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export function useRAWSData(enabled = true) {
  const [geoJSON, setGeoJSON]   = useState(EMPTY_GEOJSON);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const mountedRef  = useRef(true);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRAWSStations();
      if (!mountedRef.current) return;
      setGeoJSON(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn('[RAWS] Failed to load stations:', err.message);
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

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

  return { geoJSON, loading, error, refresh: load };
}
