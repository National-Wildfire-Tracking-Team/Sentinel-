/**
 * useFlightData.js
 * Fetches and auto-refreshes live aircraft positions from OpenSky Network.
 * Refreshes every 30 seconds while the layer is enabled.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFlights } from '../api/openSkyApi';

const REFRESH_MS = 30_000;

export function useFlightData(bounds, enabled = false) {
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
      const data = await fetchFlights(bounds);
      if (!mountedRef.current) return;
      setGeoJSON(data);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [bounds, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      load();
      intervalRef.current = setInterval(load, REFRESH_MS);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load, enabled]);

  return { geoJSON, loading, error, refresh: load };
}
