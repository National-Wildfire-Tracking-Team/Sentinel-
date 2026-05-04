/**
 * useIncidents.js
 * Fetches active wildfire incident list from WFIGS Current endpoint.
 * Returns both the incident array (for sidebar) and GeoJSON (for map markers).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchIncidents, incidentsToGeoJSON } from '../api/inciweb';
import { insertAutomatedUpdate } from './useIncidentUpdates';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

export function useIncidents(minAcres = 0.1, enabled = true) {
  const [incidents, setIncidents] = useState([]);
  const [geoJSON,   setGeoJSON]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const intervalRef   = useRef(null);
  const mountedRef    = useRef(true);
  const prevMapRef    = useRef({}); // incidentId → snapshot of key fields

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchIncidents({ minAcres });
      if (!mountedRef.current) return;
      // Sort by acres desc (largest fires first)
      const sorted = data.sort((a, b) => b.acres - a.acres);

      // Detect meaningful field changes vs previous fetch and emit automated updates.
      // Skip on the very first load (prevMapRef is empty).
      const prev = prevMapRef.current;
      if (Object.keys(prev).length > 0) {
        for (const inc of sorted) {
          const old = prev[inc.id];
          if (!old) continue;
          const changes = [];
          if (old.contained !== inc.contained)
            changes.push(`Containment: ${old.contained}% → ${inc.contained}%`);
          if (old.acres !== inc.acres)
            changes.push(`Acres: ${old.acres.toLocaleString()} → ${inc.acres.toLocaleString()}`);
          if (old.status !== inc.status)
            changes.push(`Status: ${old.status} → ${inc.status}`);
          if (old.personnel !== inc.personnel && inc.personnel > 0)
            changes.push(`Personnel: ${old.personnel.toLocaleString()} → ${inc.personnel.toLocaleString()}`);
          if (changes.length > 0) {
            insertAutomatedUpdate({
              incidentId:   inc.id,
              incidentName: inc.name,
              content:      changes.join('\n'),
              sourceName:   'IRWIN / WFIGS',
            }).catch(() => {});
          }
        }
      }
      // Snapshot current state for next comparison
      prevMapRef.current = Object.fromEntries(
        sorted.map(inc => [inc.id, { contained: inc.contained, acres: inc.acres, status: inc.status, personnel: inc.personnel }])
      );

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
