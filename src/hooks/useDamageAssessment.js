/**
 * useDamageAssessment.js
 * NWS Damage Assessment Toolkit — post-storm survey points, tracks, and polygons.
 * Refreshes every 30 minutes; surveys trickle in slowly after events, unlike live obs.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDamageAssessmentForHook, invalidateDamageAssessmentCache } from '../api/damageAssessment';

const REFRESH_MS = 30 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

export function useDamageAssessment(enabled = false) {
  const [pointsGeoJSON, setPointsGeoJSON] = useState(EMPTY_FC);
  const [linesGeoJSON, setLinesGeoJSON] = useState(EMPTY_FC);
  const [polygonsGeoJSON, setPolygonsGeoJSON] = useState(EMPTY_FC);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async (abortSignal) => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const { points, lines, polygons } = await fetchDamageAssessmentForHook({ signal: abortSignal });
      setPointsGeoJSON(points || EMPTY_FC);
      setLinesGeoJSON(lines || EMPTY_FC);
      setPolygonsGeoJSON(polygons || EMPTY_FC);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Could not load NWS damage assessment data');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const refresh = useCallback(() => {
    invalidateDamageAssessmentCache();
    const c = new AbortController();
    return load(c.signal);
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    if (enabled) {
      intervalRef.current = setInterval(() => load(controller.signal), REFRESH_MS);
    }
    return () => {
      controller.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [load, enabled]);

  return { pointsGeoJSON, linesGeoJSON, polygonsGeoJSON, loading, error, refresh };
}
