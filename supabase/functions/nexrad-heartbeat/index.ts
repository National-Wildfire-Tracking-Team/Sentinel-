/**
 * nexrad-heartbeat – Supabase Edge Function
 *
 * Records that a NEXRAD radar site is currently being viewed, so the
 * ingestion cron (scripts/nexrad-radar-sync.mjs) keeps refreshing it on
 * schedule. On top of that, if this site has no recent published scan yet
 * (first-ever view, or reactivated after being idle), this function also
 * synchronously decodes and publishes ONE scan right here before returning
 * — so the frontend's very first meta poll after the heartbeat already
 * finds real data, instead of waiting up to ~2 minutes for the next cron
 * tick. This is what gets a brand-new site from "loading" to visible
 * within a couple of seconds.
 *
 * That synchronous decode only works because it fetches a byte-range-
 * truncated PREFIX of the source file (see findSafeTruncation below), not
 * the whole ~10MB volume: decoding a full multi-elevation volume via
 * nexrad-level-2-data reliably exceeds this edge function's memory limit
 * (confirmed empirically — "Memory limit exceeded" crashes). Elevations are
 * laid out sequentially in the file starting with the lowest tilt, so a
 * truncated prefix reliably contains the base-tilt reflectivity + velocity
 * cuts (elevations 1-2 in a split-cut VCP) while using a small fraction of
 * the memory a full-file parse would. The steady-state cron keeps using the
 * full file (fine there — GitHub Actions runners have plenty of memory).
 *
 * POST body (JSON): { site_id: "KTLX" }
 */

import Level2Radar from 'npm:nexrad-level-2-data@3.0.2';
import { encodeScanPayload } from './nexradPayloadFormat.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_ID_RE = /^[A-Z]{4}$/;
const TGFTP_BASE = 'https://tgftp.nws.noaa.gov/data/radar/nexrad_level2';
const STORAGE_BUCKET = 'nexrad-scans';
const FILE_HEADER_SIZE = 24;
const PRIME_FETCH_BYTES = 4_000_000; // enough for elevations 1-2, see module doc comment
const FRESH_MS = 3 * 60 * 1000; // if a scan was published more recently than this, skip priming
const MIN_RADIALS = 300;
const ELEVATION_CANDIDATES = [1, 2, 3, 4];
const MS_TO_KNOTS = 1.943844;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function supabaseHeaders(url: string, key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

/**
 * Scan the [4-byte size][BZh... block] chain (the same layout
 * nexrad-level-2-data's own decompress.mjs walks) without decompressing
 * anything, and return the offset of the last block boundary fully
 * contained in `buf`. Truncating at this exact offset avoids a mid-block
 * BZ_UNEXPECTED_EOF — an arbitrary byte cutoff reliably fails to decompress.
 */
function findSafeTruncationOffset(buf: Uint8Array): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = FILE_HEADER_SIZE;
  let lastGoodEnd = FILE_HEADER_SIZE;
  while (pos + 4 <= buf.length) {
    const size = Math.abs(view.getInt32(pos));
    const blockStart = pos + 4;
    const blockEnd = blockStart + size;
    if (blockEnd > buf.length) break;
    lastGoodEnd = blockEnd;
    pos = blockEnd;
  }
  return lastGoodEnd;
}

function safeCall<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function findBestElevation(radar: any, getter: () => any) {
  const elevations: number[] = safeCall(() => radar.listElevations()) ?? [];
  for (const elev of ELEVATION_CANDIDATES) {
    if (!elevations.includes(elev)) continue;
    radar.setElevation(elev);
    const radials = safeCall(getter);
    if (!Array.isArray(radials)) continue;
    const definedCount = radials.filter(Boolean).length;
    if (definedCount >= MIN_RADIALS) {
      const azimuths = safeCall(() => radar.getAzimuth());
      if (Array.isArray(azimuths) && azimuths.length === radials.length) {
        const elevationDeg = radar.vcp?.record?.elevations?.[elev]?.elevation_angle ?? 0.5;
        return { elevation: elev, radials, azimuths, elevationDeg };
      }
    }
  }
  return null;
}

function julianToEpochMs(modifiedJulianDate: number, milliseconds: number): number {
  return (modifiedJulianDate - 1) * 86400000 + milliseconds;
}

async function gzip(buffer: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function findLatestFile(site: string): Promise<string | null> {
  const resp = await fetch(`${TGFTP_BASE}/${site}/dir.list`);
  if (!resp.ok) return null;
  const text = await resp.text();
  const filenames = text
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((name) => name && name.startsWith(`${site}_`) && name.endsWith('.bz2'));
  if (!filenames.length) return null;
  filenames.sort();
  return filenames[filenames.length - 1];
}

async function publishProduct(
  supabaseUrl: string,
  serviceKey: string,
  args: { site: string; product: string; elevationDeg: number; azimuths: any; radials: any[]; scanTimeMs: number; sourceFile: string },
) {
  const { site, product, elevationDeg, azimuths, radials, scanTimeMs, sourceFile } = args;
  const first = radials.find(Boolean);
  const gateCount = first.gate_count;
  const gateSizeM = first.gate_size * 1000; // library returns km, not m — see scripts/nexrad-radar-sync.mjs
  const firstGateM = first.first_gate * 1000;
  const unitConvert = product === 'velocity' ? (v: number) => v * MS_TO_KNOTS : (v: number) => v;
  const moments = radials.map((r) => (r?.moment_data ?? []).map((v: number | null) => (v == null ? v : unitConvert(v))));

  const buffer = encodeScanPayload({
    siteId: site, product, scanTimeMs, elevationDeg, azimuths, gateCount, gateSizeM, firstGateM, moments,
  });
  const compressed = await gzip(buffer);
  const storagePath = `${site}/${product}/latest.bin`;

  const uploadResp = await fetch(`${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: supabaseHeaders(supabaseUrl, serviceKey, { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }),
    body: compressed,
  });
  if (!uploadResp.ok) throw new Error(`Storage upload failed: ${uploadResp.status}`);

  const metaResp = await fetch(`${supabaseUrl}/rest/v1/nexrad_scan_meta?on_conflict=site_id,product`, {
    method: 'POST',
    headers: supabaseHeaders(supabaseUrl, serviceKey, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({
      site_id: site,
      product,
      scan_time: new Date(scanTimeMs).toISOString(),
      elevation_deg: elevationDeg,
      source_file: sourceFile,
      storage_path: storagePath,
      byte_size: compressed.byteLength,
      gate_count: gateCount,
      radial_count: azimuths.length,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!metaResp.ok) throw new Error(`Scan meta upsert failed: ${metaResp.status}`);
}

/** True if this site already has a recently-published scan (either product) — priming would be redundant. */
async function hasFreshScan(supabaseUrl: string, serviceKey: string, site: string): Promise<boolean> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/nexrad_scan_meta?select=updated_at&site_id=eq.${site}&order=updated_at.desc&limit=1`,
    { headers: supabaseHeaders(supabaseUrl, serviceKey) },
  );
  if (!resp.ok) return false;
  const rows = await resp.json();
  if (!rows.length) return false;
  return Date.now() - new Date(rows[0].updated_at).getTime() < FRESH_MS;
}

async function primeSite(supabaseUrl: string, serviceKey: string, site: string) {
  const latestFile = await findLatestFile(site);
  if (!latestFile) return { primed: false, reason: 'no-file-listed' };

  const fileResp = await fetch(`${TGFTP_BASE}/${site}/${latestFile}`, {
    headers: { Range: `bytes=0-${PRIME_FETCH_BYTES - 1}` },
  });
  if (!fileResp.ok) return { primed: false, reason: `download-failed-${fileResp.status}` };
  const fullBytes = new Uint8Array(await fileResp.arrayBuffer());

  const truncatedAt = findSafeTruncationOffset(fullBytes);
  const bytes = fullBytes.slice(0, truncatedAt);

  let radar;
  try {
    radar = new Level2Radar(bytes);
  } catch (err) {
    return { primed: false, reason: `decode-failed: ${String(err)}` };
  }

  const scanTimeMs = radar.header?.modified_julian_date != null && radar.header?.milliseconds != null
    ? julianToEpochMs(radar.header.modified_julian_date, radar.header.milliseconds)
    : Date.now();

  const reflectivity = findBestElevation(radar, () => radar.getHighresReflectivity());
  const velocity = findBestElevation(radar, () => radar.getHighresVelocity());

  const jobs: Promise<void>[] = [];
  if (reflectivity) jobs.push(publishProduct(supabaseUrl, serviceKey, { site, product: 'reflectivity', scanTimeMs, sourceFile: latestFile, ...reflectivity }));
  if (velocity) jobs.push(publishProduct(supabaseUrl, serviceKey, { site, product: 'velocity', scanTimeMs, sourceFile: latestFile, ...velocity }));

  if (!jobs.length) return { primed: false, reason: 'no-usable-elevation-in-truncated-prefix' };
  await Promise.all(jobs);
  return { primed: true, sourceFile: latestFile };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'Supabase service credentials are not configured.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const siteId = String(body?.site_id ?? '').trim().toUpperCase();
    if (!SITE_ID_RE.test(siteId)) {
      return jsonResponse({ error: 'site_id must be a 4-letter radar site identifier.' }, 400);
    }

    const heartbeatResp = await fetch(`${SUPABASE_URL}/rest/v1/nexrad_active_sites?on_conflict=site_id`, {
      method: 'POST',
      headers: supabaseHeaders(SUPABASE_URL, SERVICE_ROLE_KEY, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ site_id: siteId, last_seen_at: new Date().toISOString() }),
    });
    if (!heartbeatResp.ok) {
      const errText = await heartbeatResp.text().catch(() => '');
      return jsonResponse({ error: `Heartbeat upsert failed: ${heartbeatResp.status} ${errText.slice(0, 200)}` }, 502);
    }

    let primeResult: unknown = { primed: false, reason: 'skipped-fresh' };
    if (!(await hasFreshScan(SUPABASE_URL, SERVICE_ROLE_KEY, siteId))) {
      try {
        primeResult = await primeSite(SUPABASE_URL, SERVICE_ROLE_KEY, siteId);
      } catch (err) {
        primeResult = { primed: false, reason: `error: ${String(err)}` };
      }
    }

    return jsonResponse({ ok: true, site_id: siteId, prime: primeResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
