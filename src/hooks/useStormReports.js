/**
 * useStormReports.js
 * Pulls storm reports from both SPC (live feed) and IEM (geojson map reports).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchSpcStormReports,
  fetchIemStormReports,
  stormReportsToGeoJSON,
} from '../api/stormReports';

const REFRESH_MS = 2 * 60 * 1000;

export function useStormReports(enabled = false) {
  const [spcReports, setSpcReports] = useState([]);
  const [iemReports, setIemReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const intervalRef = useRef(null);

  // Memoize the GeoJSON conversion so it only runs when the underlying data changes
  const spcGeoJSON = useMemo(() => stormReportsToGeoJSON(spcReports), [spcReports]);
  const iemGeoJSON = useMemo(() => stormReportsToGeoJSON(iemReports), [iemReports]);

  const load = useCallback(async (abortSignal) => {
    if (!enabled) return;
    
    try {
      setLoading(true);
      setError(null);

      // Pass the abortSignal to your API functions if they support it
      const [spc, iem] = await Promise.all([
        fetchSpcStormReports({ signal: abortSignal }),
        fetchIemStormReports({ signal: abortSignal }),
      ]);

      setSpcReports(spc);
      setIemReports(iem);
    } catch (err) {
      // Ignore AbortErrors as they are intentional
      if (err.name === 'AbortError') return;
      setError(err.message || 'Could not load storm reports');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const controller = new AbortController();

    // Initial load
    load(controller.signal);

    // Set up the interval if enabled
    if (enabled) {
      intervalRef.current = setInterval(() => {
        load(controller.signal);
      }, REFRESH_MS);
    }

    // Cleanup function runs on unmount OR when dependencies (enabled/load) change
    return () => {
      controller.abort(); // Cancels any in-flight fetch requests
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [load, enabled]);

  return {
    spcReports,
    iemReports,
    spcGeoJSON,
    iemGeoJSON,
    loading,
    error,
    refresh: () => load(), // Wrapper so manual calls don't require an abort signal
  };
}
