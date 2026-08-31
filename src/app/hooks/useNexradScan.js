/**
 * useNexradScan.js
 * Drives one radar site's live Level II scan: sends the activity heartbeat
 * that keeps the ingestion cron refreshing this site, polls for new scan
 * metadata, and fetches/decodes the binary payload when the scan changes.
 *
 * The first heartbeat for a newly-selected site can trigger a synchronous
 * on-demand decode server-side (see nexrad-heartbeat's "prime" behavior),
 * which takes a couple of seconds — the first meta poll is held until that
 * settles so a brand-new site goes straight to real data instead of
 * flashing "loading" and then waiting out the full poll interval.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { sendRadarHeartbeat, fetchScanMeta, fetchScanPayload } from '../api/nexradScans';

const HEARTBEAT_MS = 60 * 1000;
const META_POLL_MS = 20 * 1000;
const STALE_MS = 15 * 60 * 1000;

export function useNexradScan(siteId, product, enabled) {
  const [meta, setMeta] = useState(null);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const lastScanTimeRef = useRef(null);
  const mountedRef = useRef(true);
  const primingRef = useRef(null);

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

  // Heartbeat: independent of `product` so switching products doesn't reset
  // the "this site is being viewed" signal, or re-trigger a fresh prime.
  // The promise is stashed so the meta-polling effect below can wait for the
  // very first heartbeat (and its possible on-demand prime) to land.
  useEffect(() => {
    if (!enabled || !siteId) return undefined;
    primingRef.current = sendRadarHeartbeat(siteId);
    const id = setInterval(() => sendRadarHeartbeat(siteId), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [enabled, siteId]);

  // Metadata + payload polling: resets whenever site or product changes.
  useEffect(() => {
    mountedRef.current = true;
    setMeta(null);
    setPayload(null);
    setError(null);
    lastScanTimeRef.current = null;

    if (!enabled || !siteId || !product) return undefined;

    let intervalId;
    (async () => {
      // Wait out the sibling effect's heartbeat/prime call (a no-op await
      // if it already resolved, e.g. when just switching products) so this
      // first poll doesn't race ahead of a scan that's about to exist.
      await primingRef.current?.catch(() => {});
      if (!mountedRef.current) return;
      await pollMeta();
      if (!mountedRef.current) return;
      intervalId = setInterval(pollMeta, META_POLL_MS);
    })();

    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [enabled, siteId, product, pollMeta]);

  const status = (() => {
    if (!enabled || !siteId) return 'idle';
    if (!meta) return 'loading';
    const age = Date.now() - new Date(meta.updated_at).getTime();
    if (age > STALE_MS) return 'stale';
    return payload ? 'live' : 'loading';
  })();

  return { meta, payload, status, error };
}
