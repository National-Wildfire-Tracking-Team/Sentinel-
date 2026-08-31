/**
 * useAirNowMonitors.js
 * Fetches AirNow individual monitor station data from the public ArcGIS
 * FeatureServer. Refreshes every 15 minutes; supports manual refresh.
 * Only fetches when `enabled` is true to avoid unnecessary requests.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAirNowMonitors } from '../api/airnow';

const REFRESH_MS = 15 * 60 * 1000;
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export function useAirNowMonitors(enabled = false) {
  const [geoJSON, setGeoJSON]   = useState(EMPTY_GEOJSON);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const mountedRef  = useRef(true);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAirNowMonitors();
      if (!mountedRef.current) return;
      setGeoJSON(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn('[AirNowMonitors] Failed to load:', err.message);
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
    } else {
      clearInterval(intervalRef.current);
    }
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [enabled, load]);

  return { geoJSON, loading, error, refresh: load };
}
