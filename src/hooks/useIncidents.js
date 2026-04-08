/**
 * useIncidents.js
 * Fetches active wildfire incident list from WFIGS Current endpoint.
 * Returns both the incident array (for sidebar) and GeoJSON (for map markers).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchIncidents, incidentsToGeoJSON } from '../api/inciweb';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

export function useIncidents(minAcres = 0.1) {
  const [incidents, setIncidents] = useState([]);
  const [geoJSON,   setGeoJSON]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchIncidents({ minAcres });
      if (!mountedRef.current) return;
      // Sort by acres desc (largest fires first)
      const sorted = data.sort((a, b) => b.acres - a.acres);
      setIncidents(sorted);
      setGeoJSON(incidentsToGeoJSON(sorted));
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [minAcres]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load]);

  return { incidents, geoJSON, loading, error, count: incidents.length, refresh: load };
}
