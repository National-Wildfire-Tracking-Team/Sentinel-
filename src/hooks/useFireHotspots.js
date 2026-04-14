/**
 * useFireHotspots.js
 * Custom hook that fetches and refreshes NASA FIRMS fire hotspot data.
 * Returns GeoJSON-ready data and loading/error state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFireHotspots, hotspotsToGeoJSON } from '../api/nasaFirms';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);
const FIRMS_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'];
const MAX_HOTSPOT_AGE_MS = 24 * 60 * 60 * 1000;

function toAcquiredAtMs(spot) {
  if (!spot?.acq_date) return null;
  const rawTime = String(spot.acq_time || '').padStart(4, '0');
  const hh = rawTime.slice(0, 2);
  const mm = rawTime.slice(2, 4);
  const iso = `${spot.acq_date}T${hh}:${mm}:00Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isRecentHotspot(spot, nowMs) {
  const acquiredAtMs = toAcquiredAtMs(spot);
  if (!acquiredAtMs) return false;
  return (nowMs - acquiredAtMs) <= MAX_HOTSPOT_AGE_MS;
}

export function useFireHotspots(bounds) {
  const [geoJSON, setGeoJSON]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(null);
  const [count,   setCount]     = useState(0);
  const [sourceCounts, setSourceCounts] = useState({});
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const sourceResults = await Promise.all(
        FIRMS_SOURCES.map(async (source) => {
          const spots = await fetchFireHotspots(bounds, 1, source);
          return { source, spots };
        }),
      );
      const nowMs = Date.now();
      const spots = sourceResults.flatMap(({ source, spots: sourceSpots }) =>
        sourceSpots
          .map((spot) => ({ ...spot, source }))
          .filter((spot) => isRecentHotspot(spot, nowMs))
      );
      const sourceCountMap = sourceResults.reduce((acc, { source, spots: sourceSpots }) => {
        acc[source] = sourceSpots.filter((spot) => isRecentHotspot(spot, nowMs)).length;
        return acc;
      }, {});
      if (!mountedRef.current) return;
      setGeoJSON(hotspotsToGeoJSON(spots));
      setCount(spots.length);
      setSourceCounts(sourceCountMap);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [bounds]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load]);

  return { geoJSON, loading, error, count, sourceCounts, refresh: load };
}
