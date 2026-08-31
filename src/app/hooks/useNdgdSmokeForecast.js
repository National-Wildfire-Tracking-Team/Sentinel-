/**
 * useNdgdSmokeForecast.js
 * Fetches NOAA NDGD hourly smoke forecast polygons (µg/m³ classes) as GeoJSON.
 * https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NDGD_SmokeForecast_v1/FeatureServer/0
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const QUERY_URL =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NDGD_SmokeForecast_v1/FeatureServer/0/query';

const REFRESH_MS = 30 * 60 * 1000; // 30 minutes (service updates frequently)
const PAGE_SIZE = 8000;

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

async function fetchPage(offset) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'geojson',
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
  });
  const res = await fetch(`${QUERY_URL}?${params}`);
  if (!res.ok) throw new Error(`NDGD smoke forecast fetch failed: ${res.status}`);
  return res.json();
}

async function fetchAllSmokeForecast() {
  const features = [];
  let offset = 0;
  // Paginate until ArcGIS stops returning exceededTransferLimit
  for (let page = 0; page < 50; page += 1) {
    const json = await fetchPage(offset);
    const chunk = json?.features;
    if (Array.isArray(chunk) && chunk.length) features.push(...chunk);
    if (!json?.properties?.exceededTransferLimit) break;
    offset += PAGE_SIZE;
  }
  return { type: 'FeatureCollection', features };
}

export function useNdgdSmokeForecast(enabled = true) {
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
      const data = await fetchAllSmokeForecast();
      if (!mountedRef.current) return;
      setGeoJSON(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn('[NdgdSmokeForecast] Failed to load:', err.message);
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
