/**
 * useFireWeatherOutlooks.js
 * Loads SPC Fire Weather Outlook polygons for a given day and type.
 * Auto-refreshes every 5 minutes when enabled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFireWeatherOutlookLayer, FIRE_WX_LAYER_ID_MAP } from '../api/spcFireWeatherOutlooks';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/**
 * @param {boolean} enabled      – whether the layer is toggled on
 * @param {string}  activeDay    – 'day1' | 'day2' | ... | 'day8'
 * @param {string}  outlookType  – 'winds_low_humidity' | 'dry_thunderstorm'
 */
export function useFireWeatherOutlooks(enabled = false, activeDay = 'day1', outlookType = 'winds_low_humidity') {
  const [geoJSON,   setGeoJSON]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [validTime, setValidTime] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;

    if (!FIRE_WX_LAYER_ID_MAP[activeDay]?.[outlookType]) {
      setGeoJSON(EMPTY_FC);
      setValidTime(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fc = await fetchFireWeatherOutlookLayer(activeDay, outlookType);
      if (!mountedRef.current) return;
      setGeoJSON(fc);
      const firstValid = fc.features.find(f => f.properties?.validTime)?.properties?.validTime ?? null;
      setValidTime(firstValid);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load fire weather outlooks');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, activeDay, outlookType]);

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
