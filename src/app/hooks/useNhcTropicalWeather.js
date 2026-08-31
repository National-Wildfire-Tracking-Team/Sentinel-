/**
 * useNhcTropicalWeather.js
 * Loads NHC tropical cyclone + tropical weather outlook data from the NOAA
 * MapServer (see src/app/api/nhcTropicalWeather.js). Auto-refreshes every 5 minutes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchNhcTropicalWeather, buildStormLabels } from '../api/nhcTropicalWeather';

const REFRESH_MS = 5 * 60 * 1000;

export function useNhcTropicalWeather(enabled = false) {
  const [forecastPointsGeoJSON,    setForecastPointsGeoJSON]    = useState(null);
  const [forecastTrackGeoJSON,     setForecastTrackGeoJSON]     = useState(null);
  const [coneGeoJSON,              setConeGeoJSON]              = useState(null);
  const [watchWarningGeoJSON,      setWatchWarningGeoJSON]      = useState(null);
  const [pastPointsGeoJSON,        setPastPointsGeoJSON]        = useState(null);
  const [pastTrackGeoJSON,         setPastTrackGeoJSON]         = useState(null);
  const [disturbancePointsGeoJSON, setDisturbancePointsGeoJSON] = useState(null);
  const [disturbanceAreasGeoJSON,  setDisturbanceAreasGeoJSON]  = useState(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await fetchNhcTropicalWeather();
      if (!mountedRef.current) return;
      setForecastPointsGeoJSON(data.forecastPointsGeoJSON);
      setForecastTrackGeoJSON(data.forecastTrackGeoJSON);
      setConeGeoJSON(data.coneGeoJSON);
      setWatchWarningGeoJSON(data.watchWarningGeoJSON);
      setPastPointsGeoJSON(data.pastPointsGeoJSON);
      setPastTrackGeoJSON(data.pastTrackGeoJSON);
      setDisturbancePointsGeoJSON(data.disturbancePointsGeoJSON);
      setDisturbanceAreasGeoJSON(data.disturbanceAreasGeoJSON);
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
    () => buildStormLabels(forecastPointsGeoJSON),
    [forecastPointsGeoJSON]
  );

  return {
    forecastPointsGeoJSON,
    forecastTrackGeoJSON,
    coneGeoJSON,
    watchWarningGeoJSON,
    pastPointsGeoJSON,
    pastTrackGeoJSON,
    disturbancePointsGeoJSON,
    disturbanceAreasGeoJSON,
    stormLabelsGeoJSON,
    loading,
    refresh: load,
  };
}
