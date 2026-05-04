/**
 * Fetches California wildfire incidents from CAL FIRE GeoJsonList.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCalFireGeoJsonList, normalizeCalFireIncidents } from '../api/calFire';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

/**
 * @param {boolean} includeInactive  Pass through to API (?inactive=true includes closed incidents)
 * @param {boolean} enabled
 */
export function useCalFireIncidents(includeInactive = false, enabled = true) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const geojson = await fetchCalFireGeoJsonList({ includeInactive });
      if (!mountedRef.current) return;
      const normalized = normalizeCalFireIncidents(geojson);
      const sorted = normalized.sort((a, b) => b.acres - a.acres);
      setIncidents(sorted);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
      setIncidents([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [includeInactive, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      clearInterval(intervalRef.current);
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load, enabled]);

  return {
    incidents,
    loading,
    error,
    count: incidents.length,
    refresh: load,
  };
}
