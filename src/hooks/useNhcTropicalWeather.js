/**
 * useNhcTropicalWeather.js
 * Loads NHC Tropical Weather outlook polygons.
 * Auto-refreshes every 10 minutes when enabled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNhcTropicalWeather } from '../api/nhcTropicalWeather';

const REFRESH_MS = 10 * 60 * 1000;

export function useNhcTropicalWeather(enabled = false) {
  const [geoJSON,  setGeoJSON]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const fc = await fetchNhcTropicalWeather();
      if (!mountedRef.current) return;
      setGeoJSON(fc);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load NHC tropical weather data');
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

  return { geoJSON, loading, error, refresh: load };
}
