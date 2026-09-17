/**
 * useNexradComposite.js
 * Composite Radar's data hook — replaces MRMS entirely. Renders every NEXRAD
 * site's own reflectivity sweep as its own map layer (see radarRaster.js's
 * rasterizeSweep, reused as-is from NexradScanLayer.jsx's single-site path)
 * rather than blending sites into one national grid — no cross-site overlap
 * math, each site keeps its own native gate resolution.
 *
 * Two things this hook does that useRadarHistory.js's single-raster model
 * can't: (1) exposes an array of per-site rasters (`sites`) instead of one,
 * and (2) culls to sites near the current viewport before ever decoding or
 * rasterizing them — decoding ~200 sites' sweeps on every poll/scrub tick is
 * real CPU/network work with nothing on screen to show for most of it.
 * Viewport culling is approximate (Web Mercator meters-per-pixel at the
 * current zoom, assuming a generous fixed viewport width) rather than exact
 * pixel bounds — a soft perf cull has no need to be pixel-precise, and this
 * avoids plumbing the Mapbox instance itself out of MapView.jsx. Viewport
 * reads are debounced so a drag/zoom gesture doesn't re-trigger network
 * fetches and rasterization on every animation frame.
 *
 * Playback ticks are synthetic, evenly-spaced timestamps — real per-site
 * scan times land on independent, staggered schedules, so "frame N" means
 * "each visible site's own nearest scan at-or-before tick N", not one shared
 * moment in time the way a single MRMS frame was.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchAllLatestReflectivity, fetchAllReflectivityHistory, fetchScanPayload, COMPOSITE_HISTORY_WINDOW_MS } from '../api/nexradScans';
import { rasterizeSweep } from '../utils/radarRaster';

const LIVE_POLL_MS = 30 * 1000;
// Cheap now that each poll is an incremental fetch (see the history-polling
// effect below) — only rows newer than the last-seen cursor come back, not
// the whole window every time.
const HISTORY_POLL_MS = 60 * 1000;
const PLAYBACK_FRAME_MS = 700;
// 5-minute synthetic scrub-bar granularity, matching NEXRAD's own per-site
// volume cadence in precipitation mode, so the 2-hour window below is 25
// ticks end to end. This only became worth doing once the ingestion job
// started publishing every new volume rather than just the newest one per
// run (cloud/nexrad-sync/sync.mjs) — before that, data landed every ~10-15
// minutes and finer ticks would only have re-rendered duplicate frames.
// Sites in clear-air mode scan every ~10 minutes, so their frames still
// repeat across consecutive ticks; that's the radar's cadence, not a bug.
const TICK_INTERVAL_MS = 5 * 60 * 1000;
// Matches nexrad-radar-sync.mjs's HISTORY_RETENTION_BY_PRODUCT.reflectivity
// (the same window plus a trailing margin) — no point generating ticks past
// what history actually holds.
const HISTORY_WINDOW_MS = COMPOSITE_HISTORY_WINDOW_MS;
// A site whose latest reflectivity is older than this is dropped from the
// live view rather than shown stale — mirrors useMrmsComposite's isFresh
// concept, applied per-site instead of to one national frame.
const STALE_MS = 20 * 60 * 1000;
const RASTER_CACHE_SIZE = 300; // bounded across all sites+ticks combined
const VIEWPORT_DEBOUNCE_MS = 600;
// A dragged <input type="range"> scrub bar fires onChange continuously
// (React's onChange is the native 'input' event, not 'change' — it fires on
// every pixel of drag, not just on release), and each call used to run a
// full resolveSites pass — a real fetch + a synchronous, CPU-heavy
// rasterizeSweep canvas loop per visible site — immediately. loadTokenRef
// already discards a stale resolve's *result*, but not the work itself: by
// the time a newer drag position invalidates it, the decode already ran and
// blocked the main thread, so a fast drag across dozens of sites piled up
// far more rasterization than any single frame actually shown. Debouncing
// the expensive resolve (not the timestamp label/slider position, which
// stays instant) means only the drag's final resting point actually
// decodes.
const SCRUB_DEBOUNCE_MS = 150;

// Approximate visible radius from viewport zoom (standard Web Mercator tile
// math), assuming a generous desktop viewport width, plus a margin for a
// site's own reflectivity range — see module doc comment for why this is
// deliberately approximate.
const ASSUMED_VIEWPORT_PX = 1600;
const SITE_RANGE_MARGIN_KM = 230;

function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Build siteId -> {lat, lng} from the same GeoJSON useNexradSites already fetches. */
function coordsFromGeoJSON(geoJSON) {
  const map = new Map();
  for (const feature of geoJSON?.features ?? []) {
    const id = feature?.properties?.id;
    const [lon, lat] = feature?.geometry?.coordinates ?? [];
    if (id && Number.isFinite(lat) && Number.isFinite(lon)) map.set(id, { lat, lng: lon });
  }
  return map;
}

/**
 * Nearest frame to `targetMs` in either direction, not just the most recent
 * one before it. Sites scan on independent, staggered schedules, so a
 * strictly-before-only pick can leave a site up to nearly a full tick
 * interval stale relative to the others at any given moment (RadarLayer.jsx
 * cross-fades the visual jump either way, but there's no reason to
 * needlessly widen the actual time gap between what different sites are
 * showing for the "same" tick when the frame just after it is closer).
 */
function nearestFrame(sortedFrames, targetMs) {
  if (!sortedFrames?.length) return null;
  let before = null;
  let after = null;
  for (const frame of sortedFrames) {
    const t = new Date(frame.scan_time).getTime();
    if (t <= targetMs) { before = frame; continue; }
    after = frame;
    break;
  }
  if (!before) return after;
  if (!after) return before;
  const beforeDiffMs = targetMs - new Date(before.scan_time).getTime();
  const afterDiffMs = new Date(after.scan_time).getTime() - targetMs;
  return afterDiffMs < beforeDiffMs ? after : before;
}

/** Drop entries older than `cutoffMs` from the front of each site's sorted (ascending) history array. */
function trimStaleHistory(siteHistoryMap, cutoffMs) {
  for (const [siteId, list] of siteHistoryMap) {
    let firstFresh = 0;
    while (firstFresh < list.length && new Date(list[firstFresh].scan_time).getTime() < cutoffMs) firstFresh++;
    if (firstFresh > 0) siteHistoryMap.set(siteId, list.slice(firstFresh));
  }
}

function generateTicks() {
  const now = Date.now();
  const end = Math.floor(now / TICK_INTERVAL_MS) * TICK_INTERVAL_MS;
  const start = end - HISTORY_WINDOW_MS;
  const ticks = [];
  for (let t = start; t <= end; t += TICK_INTERVAL_MS) {
    ticks.push({ sourceTime: new Date(t).toISOString() });
  }
  return ticks;
}

export function useNexradComposite(enabled, sitesGeoJSON, viewport) {
  const [frames, setFrames] = useState([]); // synthetic ticks, ascending
  const [selectedTimestamp, setSelectedTimestamp] = useState(null); // null = live
  const [sites, setSites] = useState([]); // [{ siteId, dataUrl, coordinates }]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [debouncedViewport, setDebouncedViewport] = useState(viewport);

  const mountedRef = useRef(true);
  const framesRef = useRef(frames);
  const selectedTimestampRef = useRef(selectedTimestamp);
  const siteCoordsRef = useRef(new Map());
  const siteLatestRef = useRef(new Map()); // siteId -> { scan_time, storage_path }
  const siteHistoryRef = useRef(new Map()); // siteId -> sorted [{ scan_time, storage_path }]
  const rasterCacheRef = useRef(new Map()); // "siteId|scan_time" -> { dataUrl, coordinates }
  const loadTokenRef = useRef(0);
  const scrubDebounceRef = useRef(null);

  useEffect(() => { framesRef.current = frames; }, [frames]);
  useEffect(() => { selectedTimestampRef.current = selectedTimestamp; }, [selectedTimestamp]);

  // Computed as a memo (not inside an effect) so visibleSiteIds below sees
  // a freshly-loaded sitesGeoJSON in the same render pass, not one render
  // late — siteCoordsRef itself is only for the async callbacks further
  // down, which don't participate in the render/memo dependency chain.
  const siteCoordsMap = useMemo(() => coordsFromGeoJSON(sitesGeoJSON), [sitesGeoJSON]);
  useEffect(() => { siteCoordsRef.current = siteCoordsMap; }, [siteCoordsMap]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (scrubDebounceRef.current) clearTimeout(scrubDebounceRef.current);
    };
  }, []);

  // Debounce viewport reads so a drag/zoom gesture doesn't retrigger network
  // fetches + rasterization on every animation frame — only settle ~600ms
  // after movement stops. Deliberately keyed on the three primitive fields
  // (not the `viewport` object itself, which ViewportContext recreates on
  // every dispatch) so this only re-arms the timer when they actually change.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedViewport(viewport), VIEWPORT_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [viewport?.latitude, viewport?.longitude, viewport?.zoom]);

  // Same reasoning: keyed on debouncedViewport's primitive fields, not the
  // object itself.
  const visibleSiteIds = useMemo(() => {
    const { latitude, longitude, zoom } = debouncedViewport ?? {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(zoom)) return new Set();
    const visibleRadiusKm = (metersPerPixel(latitude, zoom) * (ASSUMED_VIEWPORT_PX / 2)) / 1000 + SITE_RANGE_MARGIN_KM;
    const ids = new Set();
    for (const [siteId, coords] of siteCoordsMap) {
      if (haversineKm(latitude, longitude, coords.lat, coords.lng) <= visibleRadiusKm) ids.add(siteId);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [debouncedViewport?.latitude, debouncedViewport?.longitude, debouncedViewport?.zoom, siteCoordsMap]);

  const cacheGet = useCallback((key) => {
    const entry = rasterCacheRef.current.get(key);
    if (!entry) return null;
    rasterCacheRef.current.delete(key);
    rasterCacheRef.current.set(key, entry);
    return entry;
  }, []);

  const cacheSet = useCallback((key, value) => {
    if (rasterCacheRef.current.has(key)) rasterCacheRef.current.delete(key);
    rasterCacheRef.current.set(key, value);
    while (rasterCacheRef.current.size > RASTER_CACHE_SIZE) {
      rasterCacheRef.current.delete(rasterCacheRef.current.keys().next().value);
    }
  }, []);

  const loadSiteRaster = useCallback(async (siteId, frame, coords, immutable) => {
    const cacheKey = `${siteId}|${frame.scan_time}`;
    const cached = cacheGet(cacheKey);
    if (cached) return { siteId, ...cached };
    try {
      const payload = await fetchScanPayload(frame.storage_path, { immutable });
      const raster = rasterizeSweep(payload, coords);
      if (!raster) {
        // rasterizeSweep returns null (doesn't throw) for several distinct
        // reasons — missing coords, an empty/malformed payload, zero
        // radials — so this needs its own log line; the catch below never
        // sees this path at all.
        console.warn(`[Composite Radar] ${siteId}: rasterizeSweep returned null for ${frame.storage_path}`);
        return null;
      }
      cacheSet(cacheKey, raster);
      return { siteId, ...raster };
    } catch (err) {
      // One bad site shouldn't blank the rest of the composite, so this
      // still resolves to null rather than rejecting — but silently
      // swallowing the error entirely (as this used to) means a *systemic*
      // failure (every site failing the same way, e.g. a decode bug hit by
      // every payload) looks identical in the UI to "no data for this
      // tick": a blank map with zero console output, impossible to tell
      // apart from a genuine data gap.
      console.warn(`[Composite Radar] ${siteId}: raster load failed:`, err?.message || err);
      return null;
    }
  }, [cacheGet, cacheSet]);

  /** Resolve+rasterize every currently-visible site at `targetMs` (null = live). */
  const resolveSites = useCallback(async (targetMs) => {
    const isLive = targetMs == null;
    const jobs = [];
    for (const siteId of visibleSiteIds) {
      const coords = siteCoordsRef.current.get(siteId);
      if (!coords) continue;

      let frame = null;
      if (isLive) {
        const latest = siteLatestRef.current.get(siteId);
        if (latest && Date.now() - new Date(latest.scan_time).getTime() <= STALE_MS) frame = latest;
      } else {
        frame = nearestFrame(siteHistoryRef.current.get(siteId), targetMs);
      }
      if (!frame) continue;
      jobs.push(loadSiteRaster(siteId, frame, coords, !isLive));
    }
    const results = await Promise.all(jobs);
    return results.filter(Boolean);
  }, [visibleSiteIds, loadSiteRaster]);

  const loadTimestamp = useCallback(async (targetMs) => {
    // Any direct resolve (goLive, playback, a viewport change) supersedes
    // whatever scrub position was still waiting out its debounce — without
    // this, a pending debounced drag-resolve could fire after and clobber
    // a `goLive()`/playback resolve that started later but finished sooner.
    if (scrubDebounceRef.current) {
      clearTimeout(scrubDebounceRef.current);
      scrubDebounceRef.current = null;
    }
    const token = ++loadTokenRef.current;
    setLoading(true);
    try {
      const resolved = await resolveSites(targetMs);
      if (mountedRef.current && loadTokenRef.current === token) {
        setSites(resolved);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current && loadTokenRef.current === token) setError(err.message);
    } finally {
      if (mountedRef.current && loadTokenRef.current === token) setLoading(false);
    }
  }, [resolveSites]);

  const stopPlayback = useCallback(() => setIsPlaying(false), []);

  const selectFrame = useCallback((sourceTime) => {
    stopPlayback();
    const list = framesRef.current;
    const newest = list[list.length - 1];
    const isNewest = newest && sourceTime === newest.sourceTime;
    const targetMs = isNewest ? null : new Date(sourceTime).getTime();
    // Label/slider position update immediately; the expensive decode is
    // debounced (see SCRUB_DEBOUNCE_MS) so a drag's intermediate positions
    // never each pay for a full resolve.
    setSelectedTimestamp(isNewest ? null : sourceTime);
    if (scrubDebounceRef.current) clearTimeout(scrubDebounceRef.current);
    scrubDebounceRef.current = setTimeout(() => {
      scrubDebounceRef.current = null;
      loadTimestamp(targetMs);
    }, SCRUB_DEBOUNCE_MS);
  }, [loadTimestamp, stopPlayback]);

  const goLive = useCallback(() => {
    stopPlayback();
    setSelectedTimestamp(null);
    loadTimestamp(null);
  }, [loadTimestamp, stopPlayback]);

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
    if (selectedTimestampRef.current == null) setSelectedTimestamp(list[0].sourceTime);
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => stopPlayback(), [stopPlayback]);

  // Live polling: latest reflectivity pointer for every site, refreshed
  // regardless of playback state (so "go live" always resumes fresh).
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await fetchAllLatestReflectivity();
        if (cancelled || !mountedRef.current) return;
        const map = new Map();
        for (const row of rows) map.set(row.site_id, { scan_time: row.scan_time, storage_path: row.storage_path });
        siteLatestRef.current = map;
        if (selectedTimestampRef.current == null) await loadTimestamp(null);
      } catch (err) {
        if (!cancelled && mountedRef.current) setError(err.message);
      }
    };
    poll();
    const id = setInterval(poll, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled, loadTimestamp]);

  // History polling: bootstrap every site's full scan history once, then
  // keep polling with an ever-advancing scan_time cursor so repeat polls only
  // ever fetch what's new since last time (tens of rows nationally) instead
  // of re-downloading the entire window every 60s — the difference between a
  // one-time cost when Composite Radar is opened and a recurring one that
  // would otherwise scale with the playback window size.
  const historyCursorRef = useRef(null); // most recent scan_time seen so far
  useEffect(() => {
    if (!enabled) {
      setFrames([]);
      siteHistoryRef.current = new Map();
      historyCursorRef.current = null;
      return undefined;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await fetchAllReflectivityHistory(historyCursorRef.current);
        if (cancelled || !mountedRef.current) return;
        if (rows.length) {
          const map = siteHistoryRef.current;
          for (const row of rows) {
            const list = map.get(row.site_id) ?? [];
            list.push({ scan_time: row.scan_time, storage_path: row.storage_path });
            map.set(row.site_id, list);
          }
          historyCursorRef.current = rows[rows.length - 1].scan_time;
        }
        trimStaleHistory(siteHistoryRef.current, Date.now() - HISTORY_WINDOW_MS);
        setFrames(generateTicks());
      } catch (err) {
        if (!cancelled && mountedRef.current) setError(err.message);
      }
    };
    poll();
    const id = setInterval(poll, HISTORY_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled]);

  // Viewport changed (panned/zoomed to a new area) — re-resolve whichever
  // timestamp is currently shown against the newly-visible site set.
  useEffect(() => {
    if (!enabled) return;
    loadTimestamp(selectedTimestampRef.current == null ? null : new Date(selectedTimestampRef.current).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed only on the visible-site set changing
  }, [enabled, visibleSiteIds]);

  // Playback — steps through ticks one at a time, each fully resolving
  // before the next begins (same reasoning as useRadarHistory.js: an
  // interval that doesn't wait for the in-flight resolve races itself under
  // real network conditions).
  useEffect(() => {
    if (!isPlaying) return undefined;
    let cancelled = false;
    let timeoutId = null;

    const visit = async (sourceTime) => {
      await loadTimestamp(new Date(sourceTime).getTime());
      if (cancelled) return;

      const list = framesRef.current;
      const idx = list.findIndex((f) => f.sourceTime === sourceTime);
      if (idx === -1 || idx >= list.length - 1) {
        stopPlayback();
        setSelectedTimestamp(null);
        loadTimestamp(null);
        return;
      }

      const nextFrame = list[idx + 1];
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setSelectedTimestamp(nextFrame.sourceTime);
        visit(nextFrame.sourceTime);
      }, PLAYBACK_FRAME_MS);
    };

    const list = framesRef.current;
    const startTs = selectedTimestampRef.current ?? list[list.length - 1]?.sourceTime;
    if (startTs) visit(startTs);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isPlaying, loadTimestamp, stopPlayback]);

  // Reset when disabled.
  useEffect(() => {
    if (!enabled) {
      stopPlayback();
      setSelectedTimestamp(null);
      setSites([]);
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
    sites,
    selectFrame,
    play,
    pause,
    previous,
    next,
    goLive,
  };
}
