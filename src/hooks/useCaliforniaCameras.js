/**
 * useCaliforniaCameras.js
 * Fetches live California highway CCTV camera locations (Caltrans District
 * CCTV network) for map display. Refreshes every 5 minutes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCaliforniaCameras } from '../api/californiaCameras';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY = { type: 'FeatureCollection', features: [] };

export function useCaliforniaCameras(enabled = true) {
  const [geoJSON, setGeoJSON] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const mountedRef  = useRef(true);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCaliforniaCameras();
      if (!mountedRef.current) return;
      setGeoJSON(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn('[CaliforniaCameras] Failed to load:', err.message);
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
