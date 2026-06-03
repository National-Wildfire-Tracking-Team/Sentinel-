/**
 * useNhcTropicalWeather.js
 * Loads NHC active hurricane forecast track, observed past track, and error cone.
 * Auto-refreshes every 5 minutes when enabled.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchNhcTropicalWeather, buildStormLabels } from '../api/nhcTropicalWeather';

const REFRESH_MS = 5 * 60 * 1000;

export function useNhcTropicalWeather(enabled = false) {
  const [trackGeoJSON,         setTrackGeoJSON]         = useState(null);
  const [observedTrackGeoJSON, setObservedTrackGeoJSON] = useState(null);
  const [coneGeoJSON,          setConeGeoJSON]          = useState(null);
  const [loading,              setLoading]              = useState(false);
  const [error,                setError]                = useState(null);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const { track, observedTrack, cone } = await fetchNhcTropicalWeather();
      if (!mountedRef.current) return;
      setTrackGeoJSON(track);
      setObservedTrackGeoJSON(observedTrack);
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

  // Derive storm name label points from forecast track
  const stormLabelsGeoJSON = useMemo(
    () => buildStormLabels(trackGeoJSON),
    [trackGeoJSON]
  );

  return { trackGeoJSON, observedTrackGeoJSON, coneGeoJSON, stormLabelsGeoJSON, loading, error, refresh: load };
}
