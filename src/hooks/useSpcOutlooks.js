/**
 * useSpcOutlooks.js
 * Loads SPC convective outlook polygons for the weather mode.
 * Supports selecting the outlook type (categorical / tornado / hail / wind / severe)
 * and which days to show (day1 / day2 / day3 – the "day selector" UI).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpcOutlookLayer, LAYER_ID_MAP } from '../api/spcOutlooks';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/**
 * @param {boolean}  enabled      - whether the layer is toggled on
 * @param {string[]} activeDays   - e.g. ['day1', 'day2', 'day3']
 * @param {string}   outlookType  - e.g. 'categorical' | 'tornado' | 'hail' | 'wind' | 'severe'
 */
export function useSpcOutlooks(enabled = false, activeDays = ['day1', 'day2', 'day3'], outlookType = 'categorical') {
  const [geoJSON, setGeoJSON] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;

    // Only fetch days that support the chosen type
    const supportedDays = activeDays.filter(d => LAYER_ID_MAP[d]?.[outlookType] != null);
    if (supportedDays.length === 0) {
      setGeoJSON(EMPTY_FC);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await Promise.all(
        supportedDays.map(d => fetchSpcOutlookLayer(d, outlookType))
      );
      if (!mountedRef.current) return;
      setGeoJSON({
        type: 'FeatureCollection',
        features: results.flatMap(r => r.features),
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load SPC outlooks');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, activeDays, outlookType]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    if (enabled) intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [enabled, load]);

  return { geoJSON, loading, error, refresh: load };
}
