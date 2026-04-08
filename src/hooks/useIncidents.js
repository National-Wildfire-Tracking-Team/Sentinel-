/**
 * useIncidents.js
 * Fetches active wildfire incident list (InciWeb / IRWIN).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchIncidents } from '../api/inciweb';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

export function useIncidents(minAcres = 100) {
  const [incidents, setIncidents] = useState([]);
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
      setIncidents(data.sort((a, b) => b.acres - a.acres));
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

  return { incidents, loading, error, count: incidents.length, refresh: load };
}
