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

/** Fetch + decode the compact binary scan payload at the given storage path. */
export async function fetchScanPayload(storagePath) {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  const url = data?.publicUrl;
  if (!url) throw new Error('Could not resolve scan storage URL');

  // The object path never changes (overwritten in place each cycle) — bust
  // any intermediate cache so polling actually sees new bytes.
  const resp = await fetch(`${url}?t=${Date.now()}`);
  if (!resp.ok) throw new Error(`Scan payload fetch failed: HTTP ${resp.status}`);

  const compressed = await resp.arrayBuffer();
  const buffer = await gunzip(compressed);
  return decodeScanPayload(buffer);
}
