/**
 * useDroughtOutlook.js
 * Fetches CPC Monthly Drought Outlook polygons from the NOAA FeatureServer.
 * Refreshes once per hour (drought data updates monthly).
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const BASE_URL =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/cpc_drought_outlk/FeatureServer/1/query';

const REFRESH_MS = 60 * 60 * 1000; // 1 hour

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

async function fetchDroughtOutlook() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'objectid,outlook,fcst_date,target',
    f: 'geojson',
    resultRecordCount: 2000,
  });

  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) throw new Error(`Drought Outlook fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json?.features) return EMPTY_GEOJSON;
  return json;
}

export function useDroughtOutlook(enabled = true) {
  const [geoJSON, setGeoJSON] = useState(EMPTY_GEOJSON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDroughtOutlook();
      if (!mountedRef.current) return;
      setGeoJSON(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn('[DroughtOutlook] Failed to load:', err.message);
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      load();
      intervalRef.current = setInterval(load, REFRESH_MS);
    }
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [enabled, load]);

  return { geoJSON, loading, error, refresh: load };
}
