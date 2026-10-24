/**
 * useTfrs.js
 * FAA Temporary Flight Restriction outlines. Refreshes every 5 minutes: fire
 * TFRs are issued and amended through the day as incidents grow.
 */

import { useEffect, useState } from 'react';
import { fetchTfrShapes } from '../api/tfr';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

export function useTfrs(enabled = false) {
  const [geoJSON, setGeoJSON] = useState(EMPTY_FC);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        setGeoJSON(await fetchTfrShapes({ signal: controller.signal }));
        setError(null);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || 'Could not load FAA TFRs');
      }
    };
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [enabled]);

  return { geoJSON, error };
}
