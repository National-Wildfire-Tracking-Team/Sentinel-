/**
 * nexradScans.js
 * Frontend access to live NEXRAD Level II scan data published by
 * scripts/nexrad-radar-sync.mjs: a heartbeat call to keep a site "active"
 * (so the ingestion cron keeps refreshing it), plus reads of the resulting
 * scan metadata + compact binary payload from Supabase.
 */

import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';
import { decodeScanPayload } from '../utils/nexradPayloadFormat';

const STORAGE_BUCKET = 'nexrad-scans';

/** Tell the backend this site is currently being viewed. Fire-and-forget. */
export async function sendRadarHeartbeat(siteId) {
  if (!isSupabaseConfigured || !siteId) return;
  try {
    await supabase.functions.invoke('nexrad-heartbeat', { body: { site_id: siteId } });
  } catch (err) {
    console.warn('[NexradScans] Heartbeat failed:', err.message);
  }
}

/** Latest scan pointer for a site+product, or null if none published yet. */
export async function fetchScanMeta(siteId, product) {
  const { data, error } = await supabase
    .from('nexrad_scan_meta')
    .select('*')
    .eq('site_id', siteId)
    .eq('product', product)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Matches the ingestion script's HISTORY_RETENTION_MS-backed prune window and
// the site radar popup's 2-hour scrub bar.
const HISTORY_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Every scan published for a site+product in the last 2 hours, oldest to newest. */
export async function fetchScanHistory(siteId, product) {
  const sinceIso = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('nexrad_scan_history')
    .select('scan_time, storage_path')
    .eq('site_id', siteId)
    .eq('product', product)
    .gte('scan_time', sinceIso)
    .order('scan_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Decompress a gzip-compressed ArrayBuffer (the sync script gzips every payload). */
async function gunzip(arrayBuffer) {
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/**
 * Fetch + decode the compact binary scan payload at the given storage path.
 *
 * `latest.bin` (live) is overwritten in place every cycle — the URL never
 * changes even though the bytes do, so every live fetch must bust the cache
 * to actually see new data. A `history/<scan_time>.bin` path is the opposite:
 * unique per scan and never overwritten once published, so its bytes for a
 * given URL are permanently fixed. Cache-busting a historical fetch only
 * defeats the browser's own HTTP cache for no reason — pass
 * `{ immutable: true }` for historical scans to fetch a stable URL instead
 * (measured against real production data: ~150-1250ms per cache-busted
 * fetch vs ~45-70ms for a repeat request to the same stable URL).
 */
export async function fetchScanPayload(storagePath, { immutable = false } = {}) {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  const url = data?.publicUrl;
  if (!url) throw new Error('Could not resolve scan storage URL');

  const fetchUrl = immutable ? url : `${url}?t=${Date.now()}`;
  const resp = await fetch(fetchUrl);
  if (!resp.ok) throw new Error(`Scan payload fetch failed: HTTP ${resp.status}`);

  const compressed = await resp.arrayBuffer();
  const buffer = await gunzip(compressed);
  return decodeScanPayload(buffer);
}
