/**
 * useIncidents.js
 * Fetches active wildfire incident list from WFIGS Current endpoint.
 * Returns both the incident array (for sidebar) and GeoJSON (for map markers).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchIncidents, incidentsToGeoJSON } from '../api/inciweb';
import { getFireMatchKey } from './useMergedFireData';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

/**
 * WFIGS Incident Locations occasionally carries two separate records for the
 * same real-world fire (different UniqueFireIdentifier/coordinates, e.g. an
 * initial dispatch entry alongside a later IMT-assigned one) — both with the
 * same name. Collapse those to a single record, keeping the most recently
 * modified one, so the map doesn't show duplicate dots for one fire.
 */
function dedupeIncidentsByName(incidents) {
  const byKey = new Map();
  const unkeyed = [];
  for (const inc of incidents) {
    const key = getFireMatchKey(inc.name);
    if (!key) {
      unkeyed.push(inc);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing || new Date(inc.updated) > new Date(existing.updated)) {
      byKey.set(key, inc);
    }
  }
  return [...byKey.values(), ...unkeyed];
}

export function useIncidents(minAcres = 0.1, enabled = true) {
  const [incidents, setIncidents] = useState([]);
  const [geoJSON,   setGeoJSON]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const intervalRef   = useRef(null);
  const mountedRef    = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchIncidents({ minAcres });
      if (!mountedRef.current) return;
      // Sort by acres desc (largest fires first)
      const sorted = dedupeIncidentsByName(data).sort((a, b) => b.acres - a.acres);

      setIncidents(sorted);
      setGeoJSON(incidentsToGeoJSON(sorted));
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [minAcres, enabled]);

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

  return { incidents, geoJSON, loading, error, count: incidents.length, refresh: load };
}
