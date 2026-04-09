/**
 * useStormReports.js
 * Pulls storm reports from both SPC (live feed) and IEM (geojson map reports).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchSpcStormReports,
  fetchIemStormReports,
  stormReportsToGeoJSON,
} from '../api/stormReports';

const REFRESH_MS = 2 * 60 * 1000;

export function useStormReports(enabled = false) {
  const [spcReports, setSpcReports] = useState([]);
  const [iemReports, setIemReports] = useState([]);
  const [spcGeoJSON, setSpcGeoJSON] = useState(null);
  const [iemGeoJSON, setIemGeoJSON] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);

      const [spc, iem] = await Promise.all([
        fetchSpcStormReports(),
        fetchIemStormReports(),
      ]);

      if (!mountedRef.current) return;

      setSpcReports(spc);
      setIemReports(iem);
      setSpcGeoJSON(stormReportsToGeoJSON(spc));
      setIemGeoJSON(stormReportsToGeoJSON(iem));
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Could not load storm reports');
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
  }, [load, enabled]);

  return {
    spcReports,
    iemReports,
    spcGeoJSON,
    iemGeoJSON,
    loading,
    error,
    refresh: load,
  };
}
