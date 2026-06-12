/**
 * useRiverGauges.js
 * Fetches NOAA NWPS river gauge data for flood-status gauges.
 * Refreshes every 5 minutes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFloodingGauges, gaugesToGeoJSON } from '../api/noaaRiverGauges';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export function useRiverGauges(enabled = true) {
  const [gauges, setGauges]     = useState([]);
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
      const data = await fetchFloodingGauges();
      if (!mountedRef.current) return;
      setGauges(data);
      setGeoJSON(gaugesToGeoJSON(data));
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn('[RiverGauges] Load failed:', err.message);
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

  return { gauges, geoJSON, loading, error, refresh: load };
}
