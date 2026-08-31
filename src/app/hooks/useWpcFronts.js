/**
 * useWpcFronts.js
 * Loads WPC surface-analysis fronts for a given day.
 * Auto-refreshes every 5 minutes when enabled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFrontsLayer, FRONTS_LAYER_ID_MAP } from '../api/wpcFronts';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/**
 * @param {boolean} enabled   – whether the layer is toggled on
 * @param {string}  activeDay – 'day1' | 'day2' | 'day3'
 */
export function useWpcFronts(enabled = false, activeDay = 'day1') {
  const [geoJSON,   setGeoJSON]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [validTime, setValidTime] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;

    if (FRONTS_LAYER_ID_MAP[activeDay] == null) {
      setGeoJSON(EMPTY_FC);
      setValidTime(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fc = await fetchFrontsLayer(activeDay);
      if (!mountedRef.current) return;
      setGeoJSON(fc);
      const firstValid = fc.features.find(f => f.properties?.label)?.properties?.label ?? null;
      setValidTime(firstValid);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load surface analysis fronts');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, activeDay]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    if (enabled) intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [enabled, load]);

  return { geoJSON, loading, error, validTime, refresh: load };
}
