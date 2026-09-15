/**
 * mrmsComposite.js
 * Frontend access to the NOAA MRMS composite reflectivity frame published by
 * cloud/mrms-sync/sync.mjs (a Google Cloud Run Job): reads of the latest frame metadata + compact
 * binary payload from Supabase, and a windowed view of the persistent
 * mrms_radar_archive for the Composite Radar timeline. Independent of
 * api/nexradScans.js — separate bucket, separate tables, separate payload
 * format.
 */

import { supabase } from '../../shared/api/supabaseClient';
import { decodeMrmsPayload } from '../utils/mrmsPayloadFormat';

const STORAGE_BUCKET = 'mrms-scans';
const PRODUCT = 'MergedReflectivityQCComposite';

/** Latest frame pointer/status for the composite product, or null if none published yet. */
export async function fetchLatestMrmsMeta() {
  const { data, error } = await supabase
    .from('mrms_frame_meta')
    .select('*')
    .eq('product', PRODUCT)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Playback window size — the timeline scrubs through at most this many of
// the most recent frames. mrms_radar_archive is separately pruned to a 24h
// retention window by cloud/mrms-sync/sync.mjs (ARCHIVE_RETENTION_MS);
// this is a further query-side window on top of that, matching Phase 6A's
// split between "hot playback window" and "long-term archive retention."
const PLAYBACK_WINDOW_SIZE = 100;

/**
 * The newest PLAYBACK_WINDOW_SIZE frames for the composite product, oldest
 * to newest, as `{ sourceTime, storagePath }` — aliased to camelCase here
 * (PostgREST returns raw snake_case column names otherwise) since that's the
 * shape useRadarHistory.js and RadarTimeline.jsx expect throughout.
 *
 * Queried DESC + LIMIT (cheap with the table's existing
 * (product, source_time desc) index) then reversed to ascending in JS,
 * since PostgREST has no direct "last N in ascending order" — reversing up
 * to 100 small metadata rows is negligible cost.
 */
export async function fetchMrmsHistory() {
  const { data, error } = await supabase
    .from('mrms_radar_archive')
    .select('sourceTime:source_time, storagePath:storage_path')
    .eq('product', PRODUCT)
    .order('source_time', { ascending: false })
    .limit(PLAYBACK_WINDOW_SIZE);
  if (error) throw error;
  return (data ?? []).reverse();
}

/** Decompress a gzip-compressed ArrayBuffer (the sync script gzips every payload). */
async function gunzip(arrayBuffer) {
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** Fetch + decode the compact binary frame payload at the given storage path. */
export async function fetchMrmsPayload(storagePath) {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  const url = data?.publicUrl;
  if (!url) throw new Error('Could not resolve MRMS frame storage URL');

  // Only "latest.bin" is overwritten in place each cycle and needs cache-
  // busting so polling actually sees new bytes. Archive objects
  // (history/<timestamp>.bin) are written once and never overwritten — with
  // a 100-frame playback window meaning far more first-time historical
  // fetches, needlessly defeating HTTP/CDN caching on genuinely-immutable
  // objects costs real latency for no reason.
  const isLatest = storagePath.endsWith('/latest.bin');
  const resp = await fetch(isLatest ? `${url}?t=${Date.now()}` : url);
  if (!resp.ok) throw new Error(`MRMS frame fetch failed: HTTP ${resp.status}`);

  const compressed = await resp.arrayBuffer();
  const buffer = await gunzip(compressed);
  return decodeMrmsPayload(buffer);
}
