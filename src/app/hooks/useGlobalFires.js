/**
 * useGlobalFires.js
 * Global satellite fire clusters from kanari.io (outside the US) as incident
 * dots for the live map's Active Fires layer. See api/kanariFires.js.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchGlobalFires } from '../api/kanariFires';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

/**
 * @param {boolean} enabled  Fetch and poll only while true
 * @returns {{ geoJSON: object|null, loading: boolean, refresh: function }}
 */
export function useGlobalFires(enabled = true) {
  const [geoJSON, setGeoJSON] = useState(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const data = await fetchGlobalFires();
    if (!mountedRef.current) return;
    setGeoJSON(data);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return () => { mountedRef.current = false; };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [load, enabled]);

  return { geoJSON, loading, refresh: load };
}
