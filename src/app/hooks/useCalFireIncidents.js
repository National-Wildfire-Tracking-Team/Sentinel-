/**
 * Fetches California wildfire incidents from CAL FIRE GeoJsonList.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCalFireGeoJsonList, normalizeCalFireIncidents } from '../api/calFire';
import { throttleError } from '../../shared/utils/errorThrottle';
import { insertAutomatedUpdate } from './useIncidentUpdates';
import { publishIncidentChange } from '../utils/incidentChangeBus';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

/**
 * @param {boolean} includeInactive  Pass through to API (?inactive=true includes closed incidents)
 * @param {boolean} enabled
 */
export function useCalFireIncidents(includeInactive = false, enabled = true) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);
  const prevMapRef = useRef({}); // incidentId → snapshot of key fields

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const geojson = await fetchCalFireGeoJsonList({ includeInactive });
      if (!mountedRef.current) return;
      const normalized = normalizeCalFireIncidents(geojson);
      const sorted = normalized.sort((a, b) => b.acres - a.acres);

      // Detect meaningful field changes vs previous fetch and emit "Data Updated"
      // entries into the incident_updates feed. Skip on the very first load.
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

          if (changes.length > 0) {
            const localUpdate = {
              id:            `local-${Date.now()}-${inc.id}`,
              incident_id:   inc.id,
              incident_name: inc.name,
              content:       changes.join('\n'),
              source_type:   'automated',
              source_name:   'CAL FIRE',
              created_at:    new Date().toISOString(),
            };
            // Publish immediately so open panels update without waiting on Supabase.
            publishIncidentChange(inc.id, localUpdate);
            // Persist so the update survives reloads and appears for other users.
            insertAutomatedUpdate({
              incidentId:   inc.id,
              incidentName: inc.name,
              content:      changes.join('\n'),
              sourceName:   'CAL FIRE',
            }).catch(() => {});
          }
        }
      }
      prevMapRef.current = Object.fromEntries(
        sorted.map((inc) => [inc.id, { contained: inc.contained, acres: inc.acres, status: inc.status }])
      );

      setIncidents(sorted);
    } catch (err) {
      if (!mountedRef.current) return;
      // CAL FIRE may fail from the browser (CORS) while IRWIN still loads; treat as optional.
      throttleError('[CAL FIRE]', 'GeoJsonList unavailable:', err, {
        friendlyType: 'generic',
      });
      setError(null);
      setIncidents([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [includeInactive, enabled]);

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

  return {
    incidents,
    loading,
    error,
    count: incidents.length,
    refresh: load,
  };
}
