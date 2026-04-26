/**
 * NWS Local Storm Reports from NOAA MapServer (24/48/72h).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchNwsLsrMapServerForHook, invalidateNwsLsrMapServerCache } from '../api/stormReports';

const REFRESH_MS = 30 * 60 * 1000;

const EMPTY = { type: 'FeatureCollection', features: [] };

export function useNwsLsrMapServer(enabled = false) {
  const [geoJSON, setGeoJSON] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async (abortSignal) => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchNwsLsrMapServerForHook({ signal: abortSignal });
      if (data?.type === 'FeatureCollection') setGeoJSON(data);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Could not load NWS storm reports');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const refresh = useCallback(() => {
    invalidateNwsLsrMapServerCache();
    const c = new AbortController();
    return load(c.signal);
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    if (enabled) {
      intervalRef.current = setInterval(() => {
        load(controller.signal);
      }, REFRESH_MS);
    }
    return () => {
      controller.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [load, enabled]);

  return { geoJSON, loading, error, refresh };
}
