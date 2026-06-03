/**
 * useNhcTropicalWeather.js
 * Loads NHC active hurricane forecast track and error cone.
 * Auto-refreshes every 5 minutes when enabled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNhcTropicalWeather } from '../api/nhcTropicalWeather';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

export function useNhcTropicalWeather(enabled = false) {
  const [trackGeoJSON, setTrackGeoJSON] = useState(null);
  const [coneGeoJSON,  setConeGeoJSON]  = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const { track, cone } = await fetchNhcTropicalWeather();
      if (!mountedRef.current) return;
      setTrackGeoJSON(track);
      setConeGeoJSON(cone);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load NHC hurricane data');
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

  return { trackGeoJSON, coneGeoJSON, loading, error, refresh: load };
}
