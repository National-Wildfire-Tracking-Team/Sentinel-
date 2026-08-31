/**
 * useWpcWssi.js
 * Loads the WPC Winter Storm Severity Index (Overall Impact) polygons for a
 * given day. Auto-refreshes every 5 minutes when enabled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWssiLayer, WSSI_LAYER_ID_MAP } from '../api/wpcWssi';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/**
 * @param {boolean} enabled   – whether the layer is toggled on
 * @param {string}  activeDay – 'day1' | 'day2' | 'day3'
 */
export function useWpcWssi(enabled = false, activeDay = 'day1') {
  const [geoJSON,   setGeoJSON]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [validTime, setValidTime] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;

    if (WSSI_LAYER_ID_MAP[activeDay] == null) {
      setGeoJSON(EMPTY_FC);
      setValidTime(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fc = await fetchWssiLayer(activeDay);
      if (!mountedRef.current) return;
      setGeoJSON(fc);
      const firstValid = fc.features.find(f => f.properties?.validTime)?.properties?.validTime ?? null;
      setValidTime(firstValid);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load the winter storm severity index');
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
