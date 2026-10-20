/**
 * useWpcFronts.js
 * Loads WPC surface fronts and the highs/lows (pressure centers) for the
 * chosen time: 'now' is the live surface analysis (wpcSurfaceAnalysis.js,
 * reissued every 3 hours, with central pressures); 'day1'..'day3' are the
 * National Forecast Chart (wpcFronts.js; letters only, no pressures).
 * Auto-refreshes every 5 minutes when enabled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCentersLayer, fetchFrontsLayer, FRONTS_LAYER_ID_MAP, styleFronts } from '../api/wpcFronts';
import { fetchSurfaceAnalysis } from '../api/wpcSurfaceAnalysis';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/**
 * @param {boolean} enabled   – whether the layer is toggled on
 * @param {string}  activeDay – 'now' | 'day1' | 'day2' | 'day3'
 */
export function useWpcFronts(enabled = false, activeDay = 'now') {
  const [geoJSON,   setGeoJSON]   = useState(null);
  const [centers,   setCenters]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [validTime, setValidTime] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;

    if (activeDay !== 'now' && FRONTS_LAYER_ID_MAP[activeDay] == null) {
      setGeoJSON(EMPTY_FC);
      setCenters(EMPTY_FC);
      setValidTime(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      if (activeDay === 'now') {
        const analysis = await fetchSurfaceAnalysis();
        if (!mountedRef.current) return;
        setGeoJSON(styleFronts(analysis.fronts));
        setCenters(analysis.centers);
        setValidTime(analysis.validTime ? new Date(analysis.validTime).toISOString() : null);
      } else {
        const [fc, hl] = await Promise.all([
          fetchFrontsLayer(activeDay),
          fetchCentersLayer(activeDay).catch(() => EMPTY_FC), // fronts still draw without them
        ]);
        if (!mountedRef.current) return;
        setGeoJSON(fc);
        setCenters(hl);
        setValidTime(fc.features.find(f => f.properties?.label)?.properties?.label ?? null);
      }
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

  return { geoJSON, centers, loading, error, validTime, refresh: load };
}
