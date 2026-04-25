/**
 * useWeatherRadarStations.js
 * Hook for NOAA NEXRAD / TDWR weather radar station locations.
 * Station positions are static; data is cached for 24 hours.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWeatherRadarStations } from '../api/weatherRadarStations';

const REFRESH_MS  = 24 * 60 * 60 * 1000;
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export function useWeatherRadarStations(enabled = true) {
  const [geoJSON,  setGeoJSON]  = useState(EMPTY_GEOJSON);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const mountedRef  = useRef(true);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWeatherRadarStations();
      if (!mountedRef.current) return;
      setGeoJSON(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn('[WeatherRadarStations] Failed to load:', err.message);
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
