/**
 * nexradScans.js
 * Frontend access to live NEXRAD Level II scan data published by
 * cloud/nexrad-sync/sync.mjs (a Google Cloud Run Job): a heartbeat call to
 * the cloud/nexrad-heartbeat Cloud Run service (keeps a site "active" so
 * the ingestion job keeps refreshing it, and primes brand-new sites
 * on-demand), plus reads of the resulting scan metadata (Firestore) and
 * compact binary payload (Google Cloud Storage).
 *
 * Metadata/binary reads return the exact same shapes this module always
 * has (scan_time/updated_at as ISO strings, etc.) regardless of the
 * Firestore Timestamp/proxy plumbing underneath — every consumer
 * (useNexradScan.js, useNexradComposite.js) needed zero changes for this
 * migration off Supabase.
 *
 * Binary payloads are fetched through cloud/nexrad-heartbeat's `GET
 * /scan/<path>` route, not a direct storage.googleapis.com URL — the
 * bucket itself can't be made public (the org's
 * iam.allowedPolicyMemberDomains policy blocks granting allUsers any
 * role), so that service proxies reads using its own service-account
 * credentials instead. See its module doc comment.
 */

import {
  collection, doc, getDoc, getDocs, query, where, orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, getAnonymousIdToken } from '../../shared/api/firebaseClient';
import { decodeScanPayload } from '../utils/nexradPayloadFormat';

const HEARTBEAT_URL = import.meta.env.VITE_NEXRAD_HEARTBEAT_URL || '';

/** Firestore Timestamp -> ISO string, passed through unchanged if already a string/null. */
function tsToIso(value) {
  return value?.toDate ? value.toDate().toISOString() : value ?? null;
}

/** Tell the backend this site is currently being viewed. Fire-and-forget. */
export async function sendRadarHeartbeat(siteId) {
  if (!isFirebaseConfigured || !HEARTBEAT_URL || !siteId) return;
  try {
    const idToken = await getAnonymousIdToken();
    await fetch(HEARTBEAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId }),
    });
  } catch (err) {
    console.warn('[NexradScans] Heartbeat failed:', err.message);
  }
}

/** Latest scan pointer for a site+product, or null if none published yet. */
export async function fetchScanMeta(siteId, product) {
  const snap = await getDoc(doc(db, 'nexradScanMeta', `${siteId}_${product}`));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { ...data, scan_time: tsToIso(data.scan_time), updated_at: tsToIso(data.updated_at) };
}

// Matches the ingestion job's HISTORY_RETENTION_BY_PRODUCT-backed prune
// window and the site radar popup's 2-hour scrub bar. Composite Radar's
// own window is COMPOSITE_HISTORY_WINDOW_MS below.
const HISTORY_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Every scan published for a site+product in the last 2 hours, oldest to newest. */
export async function fetchScanHistory(siteId, product) {
  const since = Timestamp.fromDate(new Date(Date.now() - HISTORY_WINDOW_MS));
  const snap = await getDocs(query(
    collection(db, 'nexradScanHistory'),
    where('site_id', '==', siteId),
    where('product', '==', product),
    where('scan_time', '>=', since),
    orderBy('scan_time', 'asc'),
  ));
  return snap.docs.map((d) => {
    const data = d.data();
    return { scan_time: tsToIso(data.scan_time), storage_path: data.storage_path };
  });
}

/**
 * Latest reflectivity scan pointer for every site that has one — one bulk
 * query instead of per-site fetchScanMeta calls, for Composite Radar's
 * "every site at once" rendering (see useNexradComposite.js).
 */
export async function fetchAllLatestReflectivity() {
  const snap = await getDocs(query(
    collection(db, 'nexradScanMeta'),
    where('product', '==', 'reflectivity'),
  ));
  return snap.docs.map((d) => {
    const data = d.data();
    return { site_id: data.site_id, scan_time: tsToIso(data.scan_time), storage_path: data.storage_path };
  });
}

// Composite Radar's playback window. Same 2 hours as the single-site scrub
// bar above (it was 24h until the ingestion side's retention was cut to
// match — see cloud/nexrad-sync/sync.mjs's HISTORY_RETENTION_BY_PRODUCT),
// but kept as its own named constant since the two windows serve different
// features and have diverged before.
export const COMPOSITE_HISTORY_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Every reflectivity scan published for any site in the last
 * COMPOSITE_HISTORY_WINDOW_MS, across all sites in one query —
 * useNexradComposite.js indexes this per-site client-side for timeline
 * scrubbing, rather than issuing ~200 individual fetchScanHistory calls.
 *
 * Pass `sinceIso` (a previously-seen row's scan_time) to fetch only rows
 * newer than that instead of the full window — useNexradComposite.js calls
 * this once with no argument to bootstrap, then keeps polling with an
 * ever-advancing cursor so repeat polls stay cheap (tens of new rows)
 * instead of re-downloading the entire window every cycle.
 */
export async function fetchAllReflectivityHistory(sinceIso) {
  const cutoff = Timestamp.fromDate(new Date(sinceIso ?? Date.now() - COMPOSITE_HISTORY_WINDOW_MS));
  const snap = await getDocs(query(
    collection(db, 'nexradScanHistory'),
    where('product', '==', 'reflectivity'),
    where('scan_time', '>', cutoff),
    orderBy('scan_time', 'asc'),
  ));
  return snap.docs.map((d) => {
    const data = d.data();
    return { site_id: data.site_id, scan_time: tsToIso(data.scan_time), storage_path: data.storage_path };
  });
}

/** Decompress a gzip-compressed ArrayBuffer (the sync job gzips every payload). */
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
  if (!HEARTBEAT_URL) throw new Error('Could not resolve scan storage URL');
  const url = `${HEARTBEAT_URL}/scan/${storagePath}`;

  const fetchUrl = immutable ? url : `${url}?t=${Date.now()}`;
  const resp = await fetch(fetchUrl);
  if (!resp.ok) throw new Error(`Scan payload fetch failed: HTTP ${resp.status}`);

  const compressed = await resp.arrayBuffer();
  const buffer = await gunzip(compressed);
  return decodeScanPayload(buffer);
}
