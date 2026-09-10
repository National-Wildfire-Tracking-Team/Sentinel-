/**
 * useNexradScan.js
 * Drives one radar site's Level II scan: sends the activity heartbeat that
 * keeps the ingestion cron refreshing this site (and accumulating its scan
 * history), polls for new scan metadata, and fetches/decodes the binary
 * payload when the scan changes.
 *
 * `minutesAgo` switches between the live path (0 — poll for the latest scan)
 * and the historical path (>0 — load the site's rolling scan-history list and
 * decode whichever entry is nearest the requested offset, up to 2 hours back).
 *
 * The first heartbeat for a newly-selected site can trigger a synchronous
 * on-demand decode server-side (see nexrad-heartbeat's "prime" behavior),
 * which takes a couple of seconds — the first live meta poll is held until
 * that settles so a brand-new site goes straight to real data instead of
 * flashing "loading" and then waiting out the full poll interval.
 *
 * Decoded payloads are cached (bounded, LRU-evicted) keyed by
 * site+product+scan_time, so repeatedly revisiting the same scan — e.g.
 * scrubbing the history slider back and forth over the same stretch — skips
 * the fetch+gunzip+decode entirely. The cache stores the decoded payload
 * object itself (not a clone), so a cache hit hands back the exact same
 * object reference as before — LiveTrackerPage's rasterization `useMemo`
 * keys off that reference, so a cache hit also skips re-rasterizing for
 * free, with no separate raster cache needed here.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { sendRadarHeartbeat, fetchScanMeta, fetchScanPayload, fetchScanHistory } from '../api/nexradScans';

const HEARTBEAT_MS = 60 * 1000;
const META_POLL_MS = 20 * 1000;
const HISTORY_POLL_MS = 60 * 1000;
const STALE_MS = 15 * 60 * 1000;

// ~2 hours of history at a typical 5-6 min per-site VCP cadence is on the
// order of 20-24 scans per product; a bounded cache of 20 comfortably covers
// a full scrub across the whole window without growing unbounded.
const SCAN_CACHE_SIZE = 20;

export function useNexradScan(siteId, product, enabled, minutesAgo = 0) {
  const [meta, setMeta] = useState(null);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const lastScanTimeRef = useRef(null);
  const lastHistoryPathRef = useRef(null);
  const mountedRef = useRef(true);
  const primingRef = useRef(null);
  // sourced "site|product|scan_time" -> decoded payload. Bounded LRU, kept
  // entirely inside this hook instance — never shared with, or coupled to,
  // Composite Radar's cache or state.
  const scanCacheRef = useRef(new Map());

  const isHistorical = minutesAgo > 0;

  const cacheKey = useCallback((scanTime) => `${siteId}|${product}|${scanTime}`, [siteId, product]);

  const cacheGetScan = useCallback((scanTime) => {
    const key = cacheKey(scanTime);
    const entry = scanCacheRef.current.get(key);
    if (!entry) return null;
    scanCacheRef.current.delete(key); // refresh recency
    scanCacheRef.current.set(key, entry);
    return entry;
  }, [cacheKey]);

  const cacheSetScan = useCallback((scanTime, decoded) => {
    const key = cacheKey(scanTime);
    if (scanCacheRef.current.has(key)) scanCacheRef.current.delete(key);
    scanCacheRef.current.set(key, decoded);
    while (scanCacheRef.current.size > SCAN_CACHE_SIZE) {
      const oldestKey = scanCacheRef.current.keys().next().value;
      scanCacheRef.current.delete(oldestKey);
    }
  }, [cacheKey]);

  /** Fetch+decode a scan's payload, serving from the bounded cache when possible. */
  const loadScanPayload = useCallback(async (scanTime, storagePath) => {
    const cached = cacheGetScan(scanTime);
    if (cached) return cached;
    const decoded = await fetchScanPayload(storagePath);
    cacheSetScan(scanTime, decoded);
    return decoded;
  }, [cacheGetScan, cacheSetScan]);

  const pollMeta = useCallback(async () => {
    if (!siteId || !product) return;
    try {
      const row = await fetchScanMeta(siteId, product);
      if (!mountedRef.current) return;
      setMeta(row);

      if (row?.scan_time && row.scan_time !== lastScanTimeRef.current) {
        lastScanTimeRef.current = row.scan_time;
        try {
          const decoded = await loadScanPayload(row.scan_time, row.storage_path);
          if (mountedRef.current) {
            setPayload(decoded);
            setError(null);
          }
        } catch (err) {
          console.error('[useNexradScan] scan payload fetch failed:', err);
          if (mountedRef.current) setError('Radar data is temporarily unavailable.');
        }
      } else if (row) {
        setError(null);
      }
    } catch (err) {
      console.error('[useNexradScan] scan meta poll failed:', err);
      if (mountedRef.current) setError('Radar data is temporarily unavailable.');
    }
  }, [siteId, product, loadScanPayload]);

  // Heartbeat: independent of `product`/`minutesAgo` so switching products or
  // scrubbing history doesn't reset the "this site is being viewed" signal —
  // it's also what keeps this site's history accumulating for next time.
  useEffect(() => {
    if (!enabled || !siteId) return undefined;
    primingRef.current = sendRadarHeartbeat(siteId);
    const id = setInterval(() => sendRadarHeartbeat(siteId), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [enabled, siteId]);

  // Reset displayed data whenever the site or product changes.
  useEffect(() => {
    mountedRef.current = true;
    setMeta(null);
    setPayload(null);
    setError(null);
    setHistoryRows([]);
    setHistoryLoaded(false);
    lastScanTimeRef.current = null;
    lastHistoryPathRef.current = null;
    return () => {
      mountedRef.current = false;
    };
  }, [siteId, product]);

  // Leaving historical mode means `payload` is about to be overwritten by the
  // live path below. Clear the "last decoded historical path" guard so that
  // returning to the same historical offset later doesn't wrongly think that
  // scan is already displayed (it was, before live overwrote it) and skip
  // restoring it.
  useEffect(() => {
    if (!isHistorical) lastHistoryPathRef.current = null;
  }, [isHistorical]);

  // Live path: metadata + payload polling for the latest scan.
  useEffect(() => {
    if (!enabled || !siteId || !product || isHistorical) return undefined;

    let intervalId;
    let cancelled = false;
    (async () => {
      // Wait out the sibling effect's heartbeat/prime call (a no-op await if
      // it already resolved) so this first poll doesn't race ahead of a scan
      // that's about to exist.
      await primingRef.current?.catch(() => {});
      if (cancelled || !mountedRef.current) return;
      await pollMeta();
      if (cancelled || !mountedRef.current) return;
      intervalId = setInterval(pollMeta, META_POLL_MS);
    })();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled, siteId, product, isHistorical, pollMeta]);

  // Historical path: load the (up to) 2-hour scan list for this site+product.
  useEffect(() => {
    if (!enabled || !siteId || !product || !isHistorical) return undefined;
    let cancelled = false;

    const load = () => {
      fetchScanHistory(siteId, product)
        .then((rows) => {
          if (cancelled) return;
          setHistoryRows(rows);
          setHistoryLoaded(true);
        })
        .catch((err) => {
          console.error('[useNexradScan] scan history fetch failed:', err);
          if (!cancelled) {
            setError('Radar history is temporarily unavailable.');
            setHistoryLoaded(true);
          }
        });
    };

    load();
    const intervalId = setInterval(load, HISTORY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled, siteId, product, isHistorical]);

  // Historical path: decode whichever loaded scan is nearest the requested offset.
  useEffect(() => {
    if (!isHistorical) return undefined;
    if (!historyRows.length) {
      setMeta(null);
      setPayload(null);
      return undefined;
    }

    const targetMs = Date.now() - minutesAgo * 60 * 1000;
    let nearest = historyRows[0];
    let bestDiff = Math.abs(new Date(nearest.scan_time).getTime() - targetMs);
    for (const row of historyRows) {
      const diff = Math.abs(new Date(row.scan_time).getTime() - targetMs);
      if (diff < bestDiff) {
        nearest = row;
        bestDiff = diff;
      }
    }
    setMeta(nearest);

    // Same nearest scan as last time (common between adjacent slider ticks) — skip the redecode.
    if (lastHistoryPathRef.current === nearest.storage_path) return undefined;
    lastHistoryPathRef.current = nearest.storage_path;

    let cancelled = false;
    loadScanPayload(nearest.scan_time, nearest.storage_path)
      .then((decoded) => {
        if (!cancelled) {
          setPayload(decoded);
          setError(null);
        }
      })
      .catch((err) => {
        console.error('[useNexradScan] historical scan payload fetch failed:', err);
        if (!cancelled) setError('This historical scan is unavailable right now.');
      });
    return () => {
      cancelled = true;
    };
  }, [isHistorical, historyRows, minutesAgo, loadScanPayload]);

  const status = (() => {
    if (!enabled || !siteId) return 'idle';
    if (isHistorical) {
      if (!historyLoaded) return 'loading';
      if (!historyRows.length) return 'no-history';
      return payload ? 'historical' : 'loading';
    }
    if (!meta) return 'loading';
    const age = Date.now() - new Date(meta.updated_at).getTime();
    if (age > STALE_MS) return 'stale';
    return payload ? 'live' : 'loading';
  })();

  return { meta, payload, status, error };
}
