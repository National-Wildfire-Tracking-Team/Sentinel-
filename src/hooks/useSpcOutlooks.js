/**
 * useSpcOutlooks.js
 * Loads SPC convective outlook polygons for the weather mode.
 * Supports a single active day + outlook type selection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpcOutlookLayer, LAYER_ID_MAP } from '../api/spcOutlooks';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/**
 * @param {boolean} enabled      - whether the layer is toggled on
 * @param {string}  activeDay    - 'day1' | 'day2' | 'day3'
 * @param {string}  outlookType  - 'categorical' | 'tornado' | 'hail' | 'wind' | 'severe'
 */
export function useSpcOutlooks(enabled = false, activeDay = 'day1', outlookType = 'categorical') {
  const [geoJSON, setGeoJSON] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [validTime, setValidTime] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;

    // Guard: this (day, type) combination may not exist on the server
    if (!LAYER_ID_MAP[activeDay]?.[outlookType]) {
      setGeoJSON(EMPTY_FC);
      setValidTime(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const fc = await fetchSpcOutlookLayer(activeDay, outlookType);
      if (!mountedRef.current) return;
      setGeoJSON(fc);
      // Grab validTime from the first feature that has it
      const firstValid = fc.features.find(f => f.properties?.validTime)?.properties?.validTime ?? null;
      setValidTime(firstValid);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load SPC outlooks');
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
