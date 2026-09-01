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
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { sendRadarHeartbeat, fetchScanMeta, fetchScanPayload, fetchScanHistory } from '../api/nexradScans';

const HEARTBEAT_MS = 60 * 1000;
const META_POLL_MS = 20 * 1000;
const HISTORY_POLL_MS = 60 * 1000;
const STALE_MS = 15 * 60 * 1000;

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

  const isHistorical = minutesAgo > 0;

  const pollMeta = useCallback(async () => {
    if (!siteId || !product) return;
    try {
      const row = await fetchScanMeta(siteId, product);
      if (!mountedRef.current) return;
      setMeta(row);

      if (row?.scan_time && row.scan_time !== lastScanTimeRef.current) {
        lastScanTimeRef.current = row.scan_time;
        try {
          const decoded = await fetchScanPayload(row.storage_path);
          if (mountedRef.current) {
            setPayload(decoded);
            setError(null);
          }
        } catch (err) {
          if (mountedRef.current) setError(err.message);
        }
      } else if (row) {
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    }
  }, [siteId, product]);

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
          if (!cancelled) {
            setError(err.message);
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
    fetchScanPayload(nearest.storage_path)
      .then((decoded) => {
        if (!cancelled) {
          setPayload(decoded);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [isHistorical, historyRows, minutesAgo]);

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
