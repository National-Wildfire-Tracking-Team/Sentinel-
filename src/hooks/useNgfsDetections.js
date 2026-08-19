/**
 * useNgfsDetections.js
 * Custom hook that fetches and refreshes NOAA NESDIS NGFS (GOES satellite)
 * fire detection data. Returns GeoJSON-ready data and loading/error state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchNgfsDetections, ngfsDetectionsToPoints } from '../api/noaaNgfs';

// GOES scans CONUS roughly every 5 minutes; poll a little slower so the
// public endpoint isn't hammered while still tracking fast fire growth.
const REFRESH_MS = parseInt(import.meta.env.VITE_NGFS_REFRESH_INTERVAL || '300000', 10);

export function useNgfsDetections(enabled = true) {
  const [geoJSON, setGeoJSON] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [count, setCount]     = useState(0);
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const features = await fetchNgfsDetections();
      if (!mountedRef.current) return;
      const points = ngfsDetectionsToPoints(features);
      setGeoJSON(points);
      setCount(points.features.length);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      clearInterval(intervalRef.current);
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load, enabled]);

  return { geoJSON, loading, error, count, refresh: load };
}
