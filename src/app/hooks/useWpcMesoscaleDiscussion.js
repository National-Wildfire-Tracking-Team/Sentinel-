/**
 * useWpcMesoscaleDiscussion.js
 * Loads active WPC Mesoscale Precipitation Discussions.
 * Auto-refreshes every 5 minutes while enabled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWpcMesoscaleDiscussions } from '../api/wpcMesoscaleDiscussion';

const REFRESH_MS = 5 * 60 * 1000;

export function useWpcMesoscaleDiscussion(enabled = false) {
  const [geoJSON,  setGeoJSON]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const fc = await fetchWpcMesoscaleDiscussions();
      if (!mountedRef.current) return;
      setGeoJSON(fc);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load WPC Mesoscale Discussions');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

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
