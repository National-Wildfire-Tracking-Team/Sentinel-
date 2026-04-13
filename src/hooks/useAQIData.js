/**
 * useAQIData.js
 * Fetches AQI monitoring station data from OpenAQ (primary) with AirNow fallback.
 *
 * Viewport-aware: re-fetches automatically when the map center moves more than
 * MOVE_THRESHOLD_KM from the last fetch location, debounced to avoid hammering
 * the API during continuous panning.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAQIStations } from '../api/openaq';
import { aqiToGeoJSON } from '../api/airnow';

const REFRESH_MS       = 15 * 60 * 1000; // 15-minute auto-refresh
const MOVE_THRESHOLD_KM = 80;            // Re-fetch if center moves > 80 km
const DEBOUNCE_MS      = 2_000;          // Wait 2 s after pan stops
const DEFAULT_LAT      = 39.5;           // Continental US center
const DEFAULT_LON      = -98.35;

/** Great-circle distance (km) between two lat/lon points (Haversine). */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * (Math.PI / 180))
    * Math.cos(lat2 * (Math.PI / 180))
    * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @param {boolean} enabled    Whether the AQI layer is toggled on
 * @param {object|null} viewport  Current map viewport { latitude, longitude, zoom }
 */
export function useAQIData(enabled = false, viewport = null) {
  const [geoJSON,  setGeoJSON]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const intervalRef   = useRef(null);
  const mountedRef    = useRef(true);
  const lastCenterRef = useRef(null); // { lat, lon } of the last completed fetch
  const debounceRef   = useRef(null);

  const load = useCallback(async (lat = DEFAULT_LAT, lon = DEFAULT_LON) => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const stations = await fetchAQIStations(lat, lon);
      if (!mountedRef.current) return;
      lastCenterRef.current = { lat, lon };
      setGeoJSON(aqiToGeoJSON(stations));
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  // ── Initial load + 15-minute auto-refresh ──────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const lat = viewport?.latitude  ?? DEFAULT_LAT;
    const lon = viewport?.longitude ?? DEFAULT_LON;
    load(lat, lon);

    if (enabled) {
      intervalRef.current = setInterval(() => {
        const c = lastCenterRef.current ?? { lat: DEFAULT_LAT, lon: DEFAULT_LON };
        load(c.lat, c.lon);
      }, REFRESH_MS);
    }

    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(debounceRef.current);
    };
  }, [load, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Viewport-triggered re-fetch (debounced, threshold-gated) ──────────────
  useEffect(() => {
    if (!enabled || viewport === null || lastCenterRef.current === null) return;

    const lat  = viewport.latitude;
    const lon  = viewport.longitude;
    const dist = haversineKm(lat, lon, lastCenterRef.current.lat, lastCenterRef.current.lon);

    if (dist < MOVE_THRESHOLD_KM) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (mountedRef.current) load(lat, lon);
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [enabled, viewport?.latitude, viewport?.longitude, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    const lat = lastCenterRef.current?.lat ?? viewport?.latitude  ?? DEFAULT_LAT;
    const lon = lastCenterRef.current?.lon ?? viewport?.longitude ?? DEFAULT_LON;
    load(lat, lon);
  }, [load, viewport]);

  return { geoJSON, loading, error, refresh };
}
