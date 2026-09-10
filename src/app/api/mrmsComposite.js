/**
 * mrmsComposite.js
 * Frontend access to the NOAA MRMS composite reflectivity frame published by
 * scripts/mrms-radar-sync.mjs: reads of the latest frame metadata + compact
 * binary payload from Supabase, and (for a future history UI) the rolling
 * frame-history list. Independent of api/nexradScans.js — separate bucket,
 * separate tables, separate payload format.
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

/** Every retained frame for the composite product, oldest to newest — data access only (no history UI yet). */
export async function fetchMrmsHistory() {
  const { data, error } = await supabase
    .from('mrms_frame_history')
    .select('source_time, storage_path')
    .eq('product', PRODUCT)
    .order('source_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
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

  // The "latest" object path never changes (overwritten in place each cycle)
  // — bust any intermediate cache so polling actually sees new bytes.
  const resp = await fetch(`${url}?t=${Date.now()}`);
  if (!resp.ok) throw new Error(`MRMS frame fetch failed: HTTP ${resp.status}`);

  const compressed = await resp.arrayBuffer();
  const buffer = await gunzip(compressed);
  return decodeMrmsPayload(buffer);
}
