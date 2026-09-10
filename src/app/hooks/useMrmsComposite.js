/**
 * useMrmsComposite.js
 * Composite Radar's data hook — instantiates the generic useRadarHistory
 * engine with MRMS's own fetch/rasterize functions, and layers on the one
 * MRMS-specific concept the generic engine doesn't know about: whether the
 * *live* frame is fresh enough to trust over the IEM N0Q fallback.
 *
 * `isFresh` is deliberately about the newest known frame, not whatever the
 * user currently has selected — falling back to IEM only ever makes sense
 * in live mode (IEM has no historical capability), so the caller combines
 * `isFresh` with the hook's own `isLive` before deciding whether to trust
 * MRMS over IEM (see RadarLayer.jsx's `mrmsFresh` prop and
 * LiveTrackerPage.jsx's wiring).
 */

import { useMemo } from 'react';
import { fetchMrmsHistory, fetchMrmsPayload } from '../api/mrmsComposite';
import { rasterizeMrmsFrame } from '../utils/mrmsRaster';
import { useRadarHistory } from './useRadarHistory';

const MRMS_FRAME_CACHE_SIZE = 5;
const HISTORY_POLL_MS = 30 * 1000; // MRMS updates ~every 2 min; poll well inside that
// The IEM fallback renders from a completely different source (its own tile
// pyramid, its own uncontrolled color ramp) than MRMS's rasterized composite,
// so every time it kicks in, "live" visibly stops matching the look of the
// history/scrub-bar frames (which always render from MRMS — see
// mrmsTrustComposite in LiveTrackerPage.jsx). Kept wide — 22x the expected
// ~2-minute sync cadence — so only a genuine, sustained ingestion outage
// triggers the swap, not a single missed cron run or transient NOAA hiccup.
const STALE_MS = 45 * 60 * 1000;

export function useMrmsComposite(enabled) {
  const history = useRadarHistory({
    enabled,
    fetchHistory: fetchMrmsHistory,
    fetchPayload: fetchMrmsPayload,
    rasterize: rasterizeMrmsFrame,
    cacheSize: MRMS_FRAME_CACHE_SIZE,
    historyPollMs: HISTORY_POLL_MS,
  });

  const isFresh = useMemo(() => {
    const newest = history.frames[history.frames.length - 1];
    if (!newest) return false;
    const age = Date.now() - new Date(newest.sourceTime).getTime();
    return age <= STALE_MS;
  }, [history.frames]);

  return { ...history, isFresh };
}
