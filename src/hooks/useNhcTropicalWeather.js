/**
 * useNhcTropicalWeather.js
 * Loads NHC hurricane data from two complementary sources:
 *   - Esri Active_Hurricanes_v1 (named storm tracks + cones)
 *   - NOAA NHC MapServer layer 320 (pre-storm disturbance outlook)
 * Each source fails independently. Auto-refreshes every 5 minutes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchNhcTropicalWeather, buildStormLabels } from '../api/nhcTropicalWeather';

const REFRESH_MS = 5 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

export function useNhcTropicalWeather(enabled = false) {
  const [trackGeoJSON,         setTrackGeoJSON]         = useState(null);
  const [observedTrackGeoJSON, setObservedTrackGeoJSON] = useState(null);
  const [coneGeoJSON,          setConeGeoJSON]          = useState(null);
  const [disturbanceGeoJSON,   setDisturbanceGeoJSON]   = useState(null);
  const [loading,              setLoading]              = useState(false);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const { track, observedTrack, cone, disturbance } = await fetchNhcTropicalWeather();
      if (!mountedRef.current) return;
      setTrackGeoJSON(track);
      setObservedTrackGeoJSON(observedTrack);
      setConeGeoJSON(cone);
      setDisturbanceGeoJSON(disturbance);
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

  const stormLabelsGeoJSON = useMemo(
    () => buildStormLabels(trackGeoJSON),
    [trackGeoJSON]
  );

  return {
    trackGeoJSON,
    observedTrackGeoJSON,
    coneGeoJSON,
    disturbanceGeoJSON,
    stormLabelsGeoJSON,
    loading,
    refresh: load,
  };
}
