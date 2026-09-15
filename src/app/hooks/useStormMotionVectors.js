/**
 * useStormMotionVectors.js
 * Recomputes the Storm Motion Vectors overlay (see utils/stormMotion.js) as
 * time passes, so the plotted "now" position keeps advancing along each
 * storm's projected path even between alert refreshes. 30s is frequent
 * enough that the projected point never visibly jumps (even a 60kt storm,
 * the practical high end, moves well under a km in that span) without
 * recomputing on every render.
 */

import { useState, useEffect, useMemo } from 'react';
import { buildStormMotionVectorsGeoJSON } from '../utils/stormMotion';

const RECOMPUTE_MS = 30 * 1000;

export function useStormMotionVectors(alerts, enabled) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setNow(Date.now()), RECOMPUTE_MS);
    return () => clearInterval(id);
  }, [enabled]);

  return useMemo(
    () => (enabled ? buildStormMotionVectorsGeoJSON(alerts, now) : null),
    [alerts, now, enabled],
  );
}
