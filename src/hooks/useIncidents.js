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

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchIncidents({ minAcres });
      // Sort by acres desc (largest fires first)
      setIncidents(data.sort((a, b) => b.acres - a.acres));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [minAcres]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  return { incidents, loading, error, count: incidents.length, refresh: load };
}
