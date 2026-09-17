/**
 * index.mjs
 * nexrad-heartbeat — Google Cloud Run service (HTTP), replacing the old
 * Supabase Edge Function of the same name. Also serves GET /scan/<path>
 * (see serveScan below), streaming scan payloads out of the otherwise-
 * private GCS bucket — the org's iam.allowedPolicyMemberDomains policy
 * blocks making the bucket itself public, so this doubles as that proxy
 * rather than standing up a second Cloud Run service for it.
 *
 * Records that a NEXRAD radar site is currently being viewed, so
 * cloud/nexrad-sync's ingestion job keeps refreshing it on schedule. On top
 * of that, if this site has no recent published scan yet (first-ever view,
 * or reactivated after being idle), this function also synchronously
 * decodes and publishes ONE scan right here before returning — so the
 * frontend's very first meta poll after the heartbeat already finds real
 * data, instead of waiting up to ~2 minutes for the next Cloud Scheduler
 * tick. This is what gets a brand-new site from "loading" to visible within
 * a couple of seconds.
 *
 * That synchronous decode only works because it fetches a byte-range-
 * truncated PREFIX of the source file (see findSafeTruncationOffset below),
 * not the whole ~10MB volume — full-volume decode is what forced
 * cloud/nexrad-sync onto Cloud Run (Job) in the first place, and this
 * service keeps the same truncated-prefix trick that let the equivalent
 * Supabase Edge Function get away with a much smaller memory footprint;
 * kept here since a Cloud Run *service* answering user-facing requests
 * should stay light and fast regardless. Elevations are laid out
 * sequentially in the file starting with the lowest tilt, so a truncated
 * prefix reliably contains the base-tilt reflectivity + velocity cuts
 * (elevations 1-2 in a split-cut VCP).
 *
 * Auth: this endpoint is public (no real user accounts are involved in
 * viewing a public radar map), but an expensive on-demand NOAA decode still
 * needs abuse protection. The old Edge Function required a Supabase Auth
 * JWT and a Postgres-RPC-backed per-user rate limit
 * (supabase/functions/_shared/requestGuard.ts); the direct Google Cloud
 * equivalent is Firebase Anonymous Auth (the client signs in anonymously
 * once per session, entirely separate from the app's real — still
 * Supabase-backed — user accounts) verified here via firebase-admin, paired
 * with a Firestore-backed per-minute counter. See verifyAndRateLimit below.
 *
 * Data: writes go to the same Firestore/GCS backend cloud/nexrad-sync uses
 * — nexradScanMeta + the scan bucket, but (matching the original Edge
 * Function) never nexradScanHistory; only the scheduled sync job appends
 * history.
 *
 * POST body (JSON): { site_id: "KTLX" }
 * Header: Authorization: Bearer <firebase-id-token>
 */

import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import Level2Radar from 'nexrad-level-2-data';
import { XMLParser } from 'fast-xml-parser';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { encodeScanPayload } from './nexradPayloadFormat.js';

const GCS_BUCKET = process.env.NEXRAD_SCANS_BUCKET;
if (!GCS_BUCKET) {
  throw new Error('Missing NEXRAD_SCANS_BUCKET env var');
}

// Application Default Credentials throughout — see sync.mjs's module doc
// comment for why no explicit key/config is needed on Cloud Run. databaseId
// must be explicit: the project's Firestore database is a named database
// ("nexrad-composite"), not "(default)" — every Firestore client in this pipeline
// (this one, the browser, cloud/nexrad-sync) must agree on this same ID.
const FIRESTORE_DATABASE_ID = 'nexrad-composite';
initializeApp();
const firestore = new Firestore({ databaseId: FIRESTORE_DATABASE_ID });
const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET);
const xmlParser = new XMLParser();

const SITE_ID_RE = /^[A-Z]{4}$/;
const AWS_NEXRAD_BASE = 'https://unidata-nexrad-level2.s3.amazonaws.com';
const AWS_VOLUME_FILE_RE = /^[A-Z]{4}\d{8}_\d{6}_V06$/;
const TGFTP_BASE = 'https://tgftp.nws.noaa.gov/data/radar/nexrad_level2';
const FILE_HEADER_SIZE = 24;
const PRIME_FETCH_BYTES = 4_000_000; // enough for elevations 1-2, see module doc comment
const FRESH_MS = 3 * 60 * 1000; // if a scan was published more recently than this, skip priming
const MIN_RADIALS = 300;
const ELEVATION_CANDIDATES = [1, 2, 3, 4];
const MS_TO_KNOTS = 1.943844;
const RATE_LIMIT_PER_MINUTE = 12; // matches the old guardExpensiveRequest(req, 'nexrad-heartbeat', 12)
const FUNCTION_NAME = 'nexrad-heartbeat';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function jsonResponse(res, body, status = 200) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Verify the caller's Firebase ID token and consume a per-uid, per-minute
 * rate-limit allowance — the direct Firestore-transaction equivalent of the
 * old Postgres `consume_edge_rate_limit` RPC (see module doc comment).
 * `edgeRateLimits` docs are expected to carry a TTL policy on `expires_at`
 * (see README.md) so old windows clean up automatically, the same role the
 * Postgres function's own inline `delete ... where window_start < ...` played.
 */
async function verifyAndRateLimit(authorizationHeader) {
  if (!authorizationHeader?.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  const idToken = authorizationHeader.slice('bearer '.length).trim();

  let uid;
  try {
    ({ uid } = await getAuth().verifyIdToken(idToken));
  } catch {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const docId = `${FUNCTION_NAME}_${uid}_${windowStart.toISOString()}`;
  const ref = firestore.collection('edgeRateLimits').doc(docId);

  const allowed = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const nextCount = (snap.exists ? snap.data().count : 0) + 1;
    tx.set(ref, {
      count: nextCount,
      window_start: Timestamp.fromDate(windowStart),
      // TTL policy field (see README.md) — expires ~1 day after the window,
      // matching the old Postgres function's 1-day retention.
      expires_at: Timestamp.fromMillis(windowStart.getTime() + 24 * 60 * 60 * 1000),
    });
    return nextCount <= RATE_LIMIT_PER_MINUTE;
  });

  if (!allowed) return { ok: false, status: 429, error: 'Rate limit exceeded' };
  return { ok: true, uid };
}

/**
 * Scan the [4-byte size][BZh... block] chain (the same layout
 * nexrad-level-2-data's own decompress.mjs walks) without decompressing
 * anything, and return the offset of the last block boundary fully
 * contained in `buf`. Truncating at this exact offset avoids a mid-block
 * BZ_UNEXPECTED_EOF — an arbitrary byte cutoff reliably fails to decompress.
 */
function findSafeTruncationOffset(buf) {
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

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function findBestElevation(radar, getter) {
  const elevations = safeCall(() => radar.listElevations()) ?? [];
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

function julianToEpochMs(modifiedJulianDate, milliseconds) {
  return (modifiedJulianDate - 1) * 86400000 + milliseconds;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function utcDateParts(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return {
    yyyy: String(d.getUTCFullYear()),
    mm: String(d.getUTCMonth() + 1).padStart(2, '0'),
    dd: String(d.getUTCDate()).padStart(2, '0'),
  };
}

/** Same listing approach as cloud/nexrad-sync/sync.mjs's listAwsVolumeKeys. */
async function listAwsVolumeKeys(site, { yyyy, mm, dd }) {
  const prefix = `${yyyy}/${mm}/${dd}/${site}/`;
  const resp = await fetch(`${AWS_NEXRAD_BASE}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`);
  if (!resp.ok) throw new Error(`AWS NEXRAD list failed ${resp.status} for ${site}`);
  const parsed = xmlParser.parse(await resp.text());
  const keys = toArray(parsed?.ListBucketResult?.Contents)
    .map((entry) => String(entry?.Key ?? ''))
    .filter((key) => AWS_VOLUME_FILE_RE.test(key.slice(prefix.length)));
  keys.sort();
  return keys;
}

async function findLatestAwsFile(site) {
  const todayKeys = await listAwsVolumeKeys(site, utcDateParts(0));
  if (todayKeys.length) return todayKeys[todayKeys.length - 1];
  const yesterdayKeys = await listAwsVolumeKeys(site, utcDateParts(-1));
  return yesterdayKeys.length ? yesterdayKeys[yesterdayKeys.length - 1] : null;
}

async function findLatestTgftpFile(site) {
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

/** Prefers the NOAA/Unidata AWS archive; falls back to tgftp — see module doc comment. */
async function findLatestFile(site) {
  try {
    const awsKey = await findLatestAwsFile(site);
    if (awsKey) return { source: 'aws', filename: awsKey };
  } catch {
    // fall through to tgftp
  }

  const tgftpFile = await findLatestTgftpFile(site);
  return tgftpFile ? { source: 'tgftp', filename: tgftpFile } : null;
}

const MOMENT_UNIT_CONVERT = {
  velocity: (v) => v * MS_TO_KNOTS,
  spectrumWidth: (v) => v * MS_TO_KNOTS,
};

async function publishProduct({ site, product, elevationDeg, azimuths, radials, scanTimeMs, sourceFile }) {
  const first = radials.find(Boolean);
  const gateCount = first.gate_count;
  const gateSizeM = first.gate_size * 1000; // library returns km, not m — see cloud/nexrad-sync/sync.mjs
  const firstGateM = first.first_gate * 1000;
  // See cloud/nexrad-sync/sync.mjs's publishProduct for why velocity and
  // spectrum width (same Doppler message) are converted to knots and ZDR/CC
  // are left as the decoder returns them.
  const unitConvert = MOMENT_UNIT_CONVERT[product] ?? ((v) => v);
  const moments = radials.map((r) => (r?.moment_data ?? []).map((v) => (v == null ? v : unitConvert(v))));

  const buffer = encodeScanPayload({
    siteId: site, product, scanTimeMs, elevationDeg, azimuths, gateCount, gateSizeM, firstGateM, moments,
  });
  const compressed = gzipSync(Buffer.from(buffer));
  const storagePath = `${site}/${product}/latest.bin`;

  await bucket.file(storagePath).save(compressed, {
    contentType: 'application/octet-stream',
    resumable: false,
  });

  await firestore.collection('nexradScanMeta').doc(`${site}_${product}`).set({
    site_id: site,
    product,
    scan_time: Timestamp.fromMillis(scanTimeMs),
    elevation_deg: elevationDeg,
    source_file: sourceFile,
    storage_path: storagePath,
    byte_size: compressed.byteLength,
    gate_count: gateCount,
    radial_count: azimuths.length,
    updated_at: Timestamp.now(),
  }, { merge: true });
}

/** True if this site already has a recently-published scan (either product) — priming would be redundant. */
async function hasFreshScan(site) {
  const snap = await firestore
    .collection('nexradScanMeta')
    .where('site_id', '==', site)
    .orderBy('updated_at', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return false;
  return Date.now() - snap.docs[0].data().updated_at.toMillis() < FRESH_MS;
}

async function primeSite(site) {
  const latest = await findLatestFile(site);
  if (!latest) return { primed: false, reason: 'no-file-listed' };
  const latestFile = latest.filename;

  const fileUrl = latest.source === 'aws'
    ? `${AWS_NEXRAD_BASE}/${latest.filename}`
    : `${TGFTP_BASE}/${site}/${latest.filename}`;
  const fileResp = await fetch(fileUrl, { headers: { Range: `bytes=0-${PRIME_FETCH_BYTES - 1}` } });
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

  const products = {
    reflectivity: findBestElevation(radar, () => radar.getHighresReflectivity()),
    velocity: findBestElevation(radar, () => radar.getHighresVelocity()),
    spectrumWidth: findBestElevation(radar, () => radar.getHighresSpectrum()),
    zdr: findBestElevation(radar, () => radar.getHighresDiffReflectivity()),
    cc: findBestElevation(radar, () => radar.getHighresCorrelationCoefficient()),
  };

  const jobs = [];
  for (const [product, found] of Object.entries(products)) {
    if (found) jobs.push(publishProduct({ site, product, scanTimeMs, sourceFile: latestFile, ...found }));
  }

  if (!jobs.length) return { primed: false, reason: 'no-usable-elevation-in-truncated-prefix' };
  await Promise.all(jobs);
  return { primed: true, sourceFile: latestFile };
}

async function recordHeartbeat(site) {
  const ref = firestore.collection('nexradActiveSites').doc(site);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();
    tx.set(ref, snap.exists ? { last_seen_at: now } : { first_seen_at: now, last_seen_at: now }, { merge: true });
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

// Only ever matches the exact shapes cloud/nexrad-sync/sync.mjs and
// primeSite() above ever write — rejects anything else outright, so this
// route can never be used to read arbitrary bucket paths.
const SCAN_PATH_RE = /^[A-Z]{4}\/(?:reflectivity|velocity|spectrumWidth|zdr|cc)\/(?:latest\.bin|history\/[A-Za-z0-9-]+\.bin)$/;

/**
 * Stream one scan payload straight from the (otherwise-private) GCS bucket.
 * The bucket itself can't be made public — the org's iam.allowedPolicyMemberDomains
 * policy blocks granting allUsers any role — so the browser fetches scan
 * payloads through this route instead of a direct storage.googleapis.com
 * URL, using this service's own credentials (the same nexrad-sync-runtime
 * service account cloud/nexrad-sync uses) to read the object. No auth
 * required on this route itself: it only ever serves public NWS radar data
 * matching SCAN_PATH_RE, nothing sensitive or user-specific.
 */
async function serveScan(path, res) {
  if (!SCAN_PATH_RE.test(path)) {
    jsonResponse(res, { error: 'Invalid scan path' }, 400);
    return;
  }

  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    jsonResponse(res, { error: 'Not found' }, 404);
    return;
  }

  // Matches the caching intent the direct-GCS-URL design always had:
  // latest.bin is overwritten in place every cycle, so it must revalidate;
  // history/<key>.bin is unique per scan and never rewritten, so it's safe
  // to cache indefinitely.
  const isImmutable = path.includes('/history/');
  res.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'application/octet-stream',
    'Cache-Control': isImmutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  file.createReadStream()
    .on('error', () => { if (!res.headersSent) jsonResponse(res, { error: 'Read failed' }, 500); else res.end(); })
    .pipe(res);
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && pathname.startsWith('/scan/')) {
    await serveScan(pathname.slice('/scan/'.length), res);
    return;
  }

  if (req.method !== 'POST') {
    jsonResponse(res, { error: 'Method not allowed' }, 405);
    return;
  }

  try {
    const guard = await verifyAndRateLimit(req.headers.authorization);
    if (!guard.ok) {
      jsonResponse(res, { error: guard.error }, guard.status);
      return;
    }

    const body = await readJsonBody(req);
    const siteId = String(body?.site_id ?? '').trim().toUpperCase();
    if (!SITE_ID_RE.test(siteId)) {
      jsonResponse(res, { error: 'site_id must be a 4-letter radar site identifier.' }, 400);
      return;
    }

    await recordHeartbeat(siteId);

    let primeResult = { primed: false, reason: 'skipped-fresh' };
    if (!(await hasFreshScan(siteId))) {
      try {
        primeResult = await primeSite(siteId);
      } catch (err) {
        primeResult = { primed: false, reason: `error: ${String(err)}` };
      }
    }

    jsonResponse(res, { ok: true, site_id: siteId, prime: primeResult });
  } catch (err) {
    jsonResponse(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`[nexrad-heartbeat] listening on ${PORT}`);
});
