/**
 * useHurricaneData.js
 * Fetches active hurricane/tropical cyclone data from NOAA NHC.
 * Provides storm positions, forecast cones, and track lines as GeoJSON.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchActiveStorms,
  fetchForecastCone,
  fetchObservedTrack,
  fetchForecastTrack,
  stormsToGeoJSON,
} from '../api/nhcHurricane';

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function useHurricaneData(enabled = false) {
  const [storms, setStorms]                       = useState([]);
  const [stormsGeoJSON, setStormsGeoJSON]          = useState(null);
  const [forecastConeGeoJSON, setForecastConeGeoJSON] = useState(null);
  const [observedTrackGeoJSON, setObservedTrackGeoJSON] = useState(null);
  const [forecastTrackGeoJSON, setForecastTrackGeoJSON] = useState(null);
  const [loading, setLoading]                      = useState(false);
  const [error, setError]                          = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch all data sources in parallel
      const [stormsList, cone, observed, forecast] = await Promise.all([
        fetchActiveStorms(),
        fetchForecastCone(),
        fetchObservedTrack(),
        fetchForecastTrack(),
      ]);

      if (!mountedRef.current) return;

      setStorms(stormsList);
      setStormsGeoJSON(stormsToGeoJSON(stormsList));
      setForecastConeGeoJSON(cone);
      setObservedTrackGeoJSON(observed);
      setForecastTrackGeoJSON(forecast);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load hurricane data');
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
  }, [load, enabled]);

  return {
    storms,
    stormsGeoJSON,
    forecastConeGeoJSON,
    observedTrackGeoJSON,
    forecastTrackGeoJSON,
    loading,
    error,
    count: storms.length,
    refresh: load,
  };
}
