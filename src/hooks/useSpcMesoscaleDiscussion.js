/**
 * useSpcMesoscaleDiscussion.js
 * Loads active SPC Mesoscale Discussions for the weather tab.
 * Auto-refreshes every 5 minutes while enabled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpcMesoscaleDiscussions } from '../api/spcMesoscaleDiscussion';

const REFRESH_MS = 5 * 60 * 1000;

export function useSpcMesoscaleDiscussion(enabled = false) {
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
      const fc = await fetchSpcMesoscaleDiscussions();
      if (!mountedRef.current) return;
      setGeoJSON(fc);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load SPC Mesoscale Discussions');
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
