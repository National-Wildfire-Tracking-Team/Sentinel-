/**
 * useRadarHistory.js
 * Generic radar-frame history/playback engine: polls a frame-metadata list,
 * maintains a bounded LRU cache of decoded+rasterized frames, and exposes
 * live/historical frame selection plus play/pause/previous/next transport
 * controls.
 *
 * Deliberately has zero knowledge of MRMS or NEXRAD specifically — callers
 * supply small adapter functions (fetchHistory/fetchPayload/rasterize) so
 * this one engine can drive either radar layer's timeline without
 * duplicating per-pipeline database logic here. Currently instantiated only
 * for Composite Radar (see useMrmsComposite.js) — NEXRAD Level II has no
 * history scrub of its own (RadarSitePanel.jsx is live-only).
 *
 * `selectedTimestamp` is exposed already resolved to a concrete value (never
 * null) for the UI's convenience — internally, "tracking live" is modeled as
 * a null selection so a newly-arrived frame is picked up automatically
 * without the UI needing to re-select anything.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_CACHE_SIZE = 5;
const DEFAULT_HISTORY_POLL_MS = 30 * 1000;
const DEFAULT_PLAYBACK_FRAME_MS = 700;

export function useRadarHistory({
  enabled,
  fetchHistory,
  fetchPayload,
  rasterize,
  cacheSize = DEFAULT_CACHE_SIZE,
  historyPollMs = DEFAULT_HISTORY_POLL_MS,
  playbackFrameMs = DEFAULT_PLAYBACK_FRAME_MS,
}) {
  const [frames, setFrames] = useState([]); // ascending [{sourceTime, storagePath}]
  const [selectedTimestamp, setSelectedTimestamp] = useState(null); // null = tracking live
  const [raster, setRaster] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // The newest frame's timestamp, tracked continuously while live and frozen
  // the instant the user goes historical — lets hasNewerFrame (below) answer
  // "did a newer frame land while I was looking at something else" without
  // ever touching raster/selectedTimestamp itself (playback/review must not
  // be interrupted by a new frame arriving).
  const [liveNewestSnapshot, setLiveNewestSnapshot] = useState(null);

  const mountedRef = useRef(true);
  const cacheRef = useRef(new Map()); // sourceTime -> { payload, raster }
  const framesRef = useRef(frames);
  const selectedTimestampRef = useRef(selectedTimestamp);
  const loadTokenRef = useRef(0); // guards against out-of-order async responses

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);
  useEffect(() => {
    selectedTimestampRef.current = selectedTimestamp;
  }, [selectedTimestamp]);

  useEffect(() => {
    if (selectedTimestamp == null) {
      const newest = frames[frames.length - 1];
      setLiveNewestSnapshot(newest?.sourceTime ?? null);
    }
  }, [selectedTimestamp, frames]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cacheGet = useCallback((key) => {
    const entry = cacheRef.current.get(key);
    if (!entry) return null;
    cacheRef.current.delete(key); // refresh recency
    cacheRef.current.set(key, entry);
    return entry;
  }, []);

  const cacheSet = useCallback((key, value) => {
    if (cacheRef.current.has(key)) cacheRef.current.delete(key);
    cacheRef.current.set(key, value);
    while (cacheRef.current.size > cacheSize) {
      const oldestKey = cacheRef.current.keys().next().value;
      cacheRef.current.delete(oldestKey);
    }
  }, [cacheSize]);

  /** Load (from cache or network) the frame at `sourceTime`, updating displayed raster/loading/error. */
  const loadFrame = useCallback(async (sourceTime, frameListOverride) => {
    const list = frameListOverride || framesRef.current;
    const frame = list.find((f) => f.sourceTime === sourceTime);
    if (!frame) return;

    const cached = cacheGet(sourceTime);
    if (cached) {
      setRaster(cached.raster);
      setError(null);
      return;
    }

    const token = ++loadTokenRef.current;
    setLoading(true);
    try {
      const payload = await fetchPayload(frame.storagePath);
      const nextRaster = rasterize(payload);
      cacheSet(sourceTime, { payload, raster: nextRaster });
      if (mountedRef.current && loadTokenRef.current === token) {
        setRaster(nextRaster);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current && loadTokenRef.current === token) setError(err.message);
    } finally {
      if (mountedRef.current && loadTokenRef.current === token) setLoading(false);
    }
  }, [cacheGet, cacheSet, fetchPayload, rasterize]);

  /** Fire-and-forget cache warm for playback preloading — no display state changes. */
  const preloadFrame = useCallback(async (sourceTime) => {
    if (!sourceTime || cacheGet(sourceTime)) return;
    const frame = framesRef.current.find((f) => f.sourceTime === sourceTime);
    if (!frame) return;
    try {
      const payload = await fetchPayload(frame.storagePath);
      const nextRaster = rasterize(payload);
      cacheSet(sourceTime, { payload, raster: nextRaster });
    } catch {
      // Best-effort: a failed preload just means the eventual real load retries it.
    }
  }, [cacheGet, cacheSet, fetchPayload, rasterize]);

  // The playback effect's own cleanup (cancelled flag + clearTimeout) is what
  // actually halts an in-flight chain — this just flips the state that
  // triggers that cleanup.
  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const selectFrame = useCallback((sourceTime) => {
    stopPlayback();
    const list = framesRef.current;
    const newest = list[list.length - 1];
    setSelectedTimestamp(newest && sourceTime === newest.sourceTime ? null : sourceTime);
    loadFrame(sourceTime, list);

    // Warm the immediate neighbors so quick back-and-forth scrubbing around
    // one spot in a (now up to 100-frame) timeline feels instant.
    const idx = list.findIndex((f) => f.sourceTime === sourceTime);
    if (idx !== -1) {
      if (list[idx - 1]) preloadFrame(list[idx - 1].sourceTime);
      if (list[idx + 1]) preloadFrame(list[idx + 1].sourceTime);
    }
  }, [loadFrame, preloadFrame, stopPlayback]);

  const goLive = useCallback(() => {
    stopPlayback();
    setSelectedTimestamp(null);
    const list = framesRef.current;
    const newest = list[list.length - 1];
    if (newest) loadFrame(newest.sourceTime, list);
  }, [loadFrame, stopPlayback]);

  const stepBy = useCallback((delta) => {
    const list = framesRef.current;
    if (!list.length) return;
    const currentTs = selectedTimestampRef.current ?? list[list.length - 1].sourceTime;
    const idx = list.findIndex((f) => f.sourceTime === currentTs);
    const nextIdx = Math.min(list.length - 1, Math.max(0, (idx === -1 ? list.length - 1 : idx) + delta));
    const nextFrame = list[nextIdx];
    if (nextFrame) selectFrame(nextFrame.sourceTime);
  }, [selectFrame]);

  const previous = useCallback(() => stepBy(-1), [stepBy]);
  const next = useCallback(() => stepBy(1), [stepBy]);

  const play = useCallback(() => {
    const list = framesRef.current;
    if (list.length < 2) return;
    // Starting a fresh loop from live plays the whole available history;
    // resuming from a scrubbed position just continues forward from there.
    // The actual load for this starting frame happens in the playback
    // effect below (its first `visit` call) — there is exactly one load
    // path for playback, so nothing here races against it.
    if (selectedTimestampRef.current == null) {
      setSelectedTimestamp(list[0].sourceTime);
    }
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  // Poll the frame list. Live mode auto-tracks whatever is newest; historical
  // selections are left alone (arriving frames don't disturb what's on screen).
  useEffect(() => {
    if (!enabled) {
      setFrames([]);
      return undefined;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await fetchHistory();
        if (cancelled || !mountedRef.current) return;
        setFrames(list);
        if (selectedTimestampRef.current == null) {
          const newest = list[list.length - 1];
          if (newest) loadFrame(newest.sourceTime, list);
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) setError(err.message);
      }
    };

    refresh();
    const intervalId = setInterval(refresh, historyPollMs);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled, fetchHistory, historyPollMs, loadFrame]);

  // Playback — visits frames strictly one at a time, each one's load fully
  // settling before the next begins (see module doc comment for why: an
  // interval that doesn't wait for the in-flight load races against
  // loadFrame's own out-of-order guard and silently drops frames whenever a
  // fetch+decode+rasterize takes longer than one tick, which real network
  // conditions routinely do). `cancelled` (not clearInterval) is the stop
  // mechanism, checked after every await, so pause/unmount/disable/reaching-
  // live all correctly halt the chain even mid-load.
  useEffect(() => {
    if (!isPlaying) return undefined;
    let cancelled = false;
    let timeoutId = null;

    const visit = async (sourceTime) => {
      const list = framesRef.current;
      await loadFrame(sourceTime, list);
      if (cancelled) return;

      const idx = list.findIndex((f) => f.sourceTime === sourceTime);
      if (idx === -1 || idx >= list.length - 1) {
        // Already at (or fell off) the newest frame — stop here, live.
        stopPlayback();
        setSelectedTimestamp(null);
        return;
      }

      const nextFrame = list[idx + 1];
      // Warm the cache for the frame after next while this one displays,
      // so its own load below is usually a cache hit by the time we reach it.
      const preloadTarget = list[idx + 2];
      if (preloadTarget) preloadFrame(preloadTarget.sourceTime);

      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setSelectedTimestamp(nextFrame.sourceTime);
        visit(nextFrame.sourceTime);
      }, playbackFrameMs);
    };

    const list = framesRef.current;
    const startTs = selectedTimestampRef.current ?? list[list.length - 1]?.sourceTime;
    if (startTs) visit(startTs);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isPlaying, playbackFrameMs, loadFrame, preloadFrame, stopPlayback]);

  // Reset transient state when this radar layer is disabled — timers must
  // not keep running, and stale frame/error state shouldn't linger for the
  // next time it's enabled.
  useEffect(() => {
    if (!enabled) {
      stopPlayback();
      setSelectedTimestamp(null);
      setRaster(null);
      setError(null);
      setLoading(false);
    }
  }, [enabled, stopPlayback]);

  const isLive = selectedTimestamp == null;
  const resolvedSelectedTimestamp = selectedTimestamp ?? (frames[frames.length - 1]?.sourceTime ?? null);
  const newestFrame = frames[frames.length - 1];
  const hasNewerFrame = !isLive && Boolean(newestFrame) && Boolean(liveNewestSnapshot)
    && newestFrame.sourceTime !== liveNewestSnapshot;

  return {
    frames,
    selectedTimestamp: resolvedSelectedTimestamp,
    isLive,
    isPlaying,
    loading,
    error,
    raster,
    hasNewerFrame,
    selectFrame,
    play,
    pause,
    previous,
    next,
    goLive,
  };
}
