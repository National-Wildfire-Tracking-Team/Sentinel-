/**
 * useExternalIncidents.js
 * Active IRWIN/WFIGS + CAL FIRE incidents for the reporter dashboard, shared
 * by the External Incidents tab (lists them) and the Manage Incidents tab
 * (links a reporter's incident to the official one once CAL FIRE or IRWIN
 * lists it, so both edit the same evacuations and shelters).
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchIncidents } from '../../api/inciweb';
import { fetchCalFireGeoJsonList, normalizeCalFireIncidents } from '../../api/calFire';
import { mergeIrwinAndCalFireIncidents } from '../../utils/mergeIncidents';

/**
 * Merge IRWIN/WFIGS + CAL FIRE incidents with the same rule and inputs as the
 * live map (CAL FIRE wins a name match; inactive CAL FIRE incidents
 * included), so a reporter's updates, evacuations and shelters land on the
 * same incident id the map opens. The other source's id rides along as an
 * alias.
 */
async function loadMergedExternalIncidents() {
  const [irwinIncidents, calFireGeoJSON] = await Promise.all([
    fetchIncidents({ minAcres: 0.1 }),
    fetchCalFireGeoJsonList({ includeInactive: true }).catch(() => ({ type: 'FeatureCollection', features: [] })),
  ]);
  // Same 30-day staleness cut as the live map's incident feed (LiveTrackerPage).
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return mergeIrwinAndCalFireIncidents(irwinIncidents, normalizeCalFireIncidents(calFireGeoJSON))
    .filter((inc) => {
      const t = new Date(inc.updated).getTime();
      return !Number.isFinite(t) || t > cutoff;
    });
}

/**
 * @param {boolean} enabled  Fetch only once a tab that needs the list is open;
 *   the list is kept after that.
 */
export function useExternalIncidents(enabled) {
  const [incidents, setIncidents] = useState([]);
  const [loaded, setLoaded]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setIncidents(await loadMergedExternalIncidents());
    } catch (err) {
      setError(err?.message || 'Failed to load incidents.');
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && !loaded && !loading) refresh();
  }, [enabled, loaded, loading, refresh]);

  return { incidents, loading, error, refresh };
}
