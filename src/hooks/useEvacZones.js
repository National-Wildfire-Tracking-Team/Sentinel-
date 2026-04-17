/**
 * useEvacZones.js
 * React hook for California evacuation zones data.
 * Fetches from Cal OES ArcGIS service and refreshes on a 5-minute interval.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchCAEvacZones } from '../api/caEvacZones';

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export function useEvacZones(enabled = true) {
  const [geoJSON, setGeoJSON]   = useState(EMPTY_GEOJSON);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);
  const intervalRef             = useRef(null);
  const mountedRef              = useRef(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    const data = await fetchCAEvacZones();
    if (!mountedRef.current) return;
    setGeoJSON(data);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load]);

  return { geoJSON, loading, error, refresh: load };
}
