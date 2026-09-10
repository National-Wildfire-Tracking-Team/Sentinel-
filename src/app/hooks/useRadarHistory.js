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
 * for Composite Radar (see useMrmsComposite.js) — NEXRAD Level II keeps its
 * own, already-independent history UI (RadarSitePanel.jsx's scrub slider).
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

  const mountedRef = useRef(true);
  const cacheRef = useRef(new Map()); // sourceTime -> { payload, raster }
  const playbackTimerRef = useRef(null);
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

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const selectFrame = useCallback((sourceTime) => {
    stopPlayback();
    const list = framesRef.current;
    const newest = list[list.length - 1];
    setSelectedTimestamp(newest && sourceTime === newest.sourceTime ? null : sourceTime);
    loadFrame(sourceTime, list);
  }, [loadFrame, stopPlayback]);

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
    if (selectedTimestampRef.current == null) {
      setSelectedTimestamp(list[0].sourceTime);
      loadFrame(list[0].sourceTime, list);
    }
    setIsPlaying(true);
  }, [loadFrame]);

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

  // Playback timer — steps chronologically, preloads one frame ahead, and
  // stops itself (transitioning to live) on reaching the newest frame.
  useEffect(() => {
    if (!isPlaying) return undefined;

    const tick = () => {
      const list = framesRef.current;
      if (!list.length) return;
      const currentTs = selectedTimestampRef.current ?? list[list.length - 1].sourceTime;
      const idx = list.findIndex((f) => f.sourceTime === currentTs);
      const nextIdx = idx + 1;

      if (nextIdx >= list.length - 1) {
        stopPlayback();
        setSelectedTimestamp(null);
        loadFrame(list[list.length - 1].sourceTime, list);
        return;
      }

      const nextFrame = list[nextIdx];
      setSelectedTimestamp(nextFrame.sourceTime);
      loadFrame(nextFrame.sourceTime, list);

      const preloadTarget = list[nextIdx + 1];
      if (preloadTarget) preloadFrame(preloadTarget.sourceTime);
    };

    const intervalId = setInterval(tick, playbackFrameMs);
    return () => clearInterval(intervalId);
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

  return {
    frames,
    selectedTimestamp: resolvedSelectedTimestamp,
    isLive,
    isPlaying,
    loading,
    error,
    raster,
    selectFrame,
    play,
    pause,
    previous,
    next,
    goLive,
  };
}
