/**
 * useWeatherAlerts.js
 * Fetches active Red Flag Warnings and Fire Weather Watches from NOAA.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFireWeatherAlerts, alertsToGeoJSON } from '../api/noaaWeather';
import { useApp } from '../context/AppContext';

const REFRESH_MS = 5 * 60 * 1000;

export function useWeatherAlerts() {
  const [alerts,   setAlertsState] = useState([]);
  const [geoJSON,  setGeoJSON]     = useState(null);
  const [loading,  setLoading]     = useState(true);
  const [error,    setError]       = useState(null);
  const { setAlerts }              = useApp();
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFireWeatherAlerts();
      if (!mountedRef.current) return;
      setAlertsState(data);
      setAlerts(data);
      setGeoJSON(alertsToGeoJSON(data));
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [setAlerts]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load]);

  return { alerts, geoJSON, loading, error, refresh: load };
}
