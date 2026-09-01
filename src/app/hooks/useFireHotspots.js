/**
 * useFireHotspots.js
 * Custom hook that fetches and refreshes NASA FIRMS fire hotspot data.
 * Returns GeoJSON-ready data and loading/error state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFireHotspots, consolidateHotspots, csvHotspotsToPoints } from '../api/nasaFirms';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);
const FIRMS_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'];
// FIRMS day_range is calendar-day based in UTC and NRT data lags ~3h, so a
// single-day query can return nothing around UTC midnight. Fetch two days
// and keep detections from roughly the last 24h client-side so the map
// always has fresh coverage regardless of when the user loads the page.
const FIRMS_DAY_RANGE = 2;
const MAX_HOTSPOT_AGE_MS = 48 * 60 * 60 * 1000;

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
  // If the timestamp is unparseable, keep the detection rather than drop it –
  // FIRMS has already limited the result set to the requested day range.
  if (acquiredAtMs == null) return true;
  return (nowMs - acquiredAtMs) <= MAX_HOTSPOT_AGE_MS;
}

export function useFireHotspots(bounds, enabled = true) {
  const [geoJSON, setGeoJSON]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(null);
  const [count,   setCount]     = useState(0);
  const [sourceCounts, setSourceCounts] = useState({});
  const intervalRef = useRef(null);
  const mountedRef  = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const sourceResults = await Promise.all(
        FIRMS_SOURCES.map(async (source) => {
          const spots = await fetchFireHotspots(bounds, FIRMS_DAY_RANGE, source);
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
      const consolidated = consolidateHotspots(spots);
      setGeoJSON(csvHotspotsToPoints(consolidated));
      setCount(consolidated.length);
      setSourceCounts(sourceCountMap);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [bounds, enabled]);

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

  return { geoJSON, loading, error, count, sourceCounts, refresh: load };
}
