/**
 * useAQIData.js
 * Fetches AQI monitoring station data from AirNow.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAQIStations, aqiToGeoJSON } from '../api/airnow';

const REFRESH_MS = 15 * 60 * 1000; // AQI updates hourly; refresh every 15 min

export function useAQIData(enabled = false) {
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
      const stations = await fetchAQIStations();
      if (!mountedRef.current) return;
      setGeoJSON(aqiToGeoJSON(stations));
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    if (enabled) {
      intervalRef.current = setInterval(load, REFRESH_MS);
    }
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load, enabled]);

  return { geoJSON, loading, error, refresh: load };
}
