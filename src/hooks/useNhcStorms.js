/**
 * useNhcStorms.js
 * React hook for NHC tropical storm / hurricane data.
 * Polls fetchAllNhcData() every 10 minutes when enabled.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllNhcData } from '../api/nhcStorms';

const REFRESH_INTERVAL = 10 * 60 * 1000;

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

export function useNhcStorms(enabled = true) {
  const [centersGeoJSON, setCenters] = useState(null);
  const [conesGeoJSON,   setCones]   = useState(null);
  const [tracksGeoJSON,  setTracks]  = useState(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const { centers, cones, tracks } = await fetchAllNhcData();
      if (!mountedRef.current) return;
      setCenters(centers ?? EMPTY_FC);
      setCones(cones   ?? EMPTY_FC);
      setTracks(tracks ?? EMPTY_FC);
    } catch (err) {
      console.warn('[useNhcStorms]', err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setCenters(null);
      setCones(null);
      setTracks(null);
      return;
    }
    load();
    const interval = setInterval(load, REFRESH_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [enabled, load]);

  return { centersGeoJSON, conesGeoJSON, tracksGeoJSON, loading, refresh: load };
}
