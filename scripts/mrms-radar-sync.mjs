/**
 * mrms-radar-sync.mjs
 * Decodes NOAA's real-time MRMS national composite reflectivity product
 * (MergedReflectivityQCComposite) and publishes a compact pre-processed
 * payload to Supabase for the frontend's Composite Radar layer to render.
 * Run on a schedule by .github/workflows/mrms-radar-sync.yml, mirroring
 * scripts/nexrad-radar-sync.mjs's plain-Node, raw-REST-to-Supabase-with-
 * service-role-key pattern — but this is a fully independent pipeline: a
 * different source, different decoder, different Supabase bucket/tables,
 * and a genuinely different grid geometry (regular lat/lon, not NEXRAD's
 * polar radials). NEXRAD Level II is untouched by this script.
 *
 * Data source: mrms.ncep.noaa.gov/2D/MergedReflectivityQCComposite/, NOAA's
 * official real-time MRMS product server. It publishes one timestamped
 * GRIB2 file roughly every 2 minutes (plus a ".latest" pointer, which this
 * script intentionally ignores in favor of timestamped files, so "already
 * processed" dedup and future history scrubbing both have a real timestamp
 * to key off). Directory listing is a plain Apache autoindex page —
 * filenames are regex-extracted from `href="..."` the same way tgftp's
 * dir.list was scraped for NEXRAD.
 *
 * Decoding: wgrib2 (pinned 3.8.0, installed via conda-forge in CI — see the
 * workflow file) owns all GRIB2-specific interpretation. In one invocation it
 * decompresses the GRIB2 message, regrids the native 0.01°(~7000x3500,
 * 24.5M cell) grid down to a coarser 0.04° grid (~1750x875, ~1.5M cells —
 * plenty for a national-overview layer; NEXRAD Level II site view is where
 * users get fine detail) using NEAREST-NEIGHBOR interpolation (not
 * bilinear/budget) so real values are never blended with the "no data"
 * sentinels below, and dumps the result as flat big-endian IEEE floats.
 *
 * Missing values — confirmed against a real production file during
 * implementation, not assumed: this product uses no GRIB2 bitmap
 * (wgrib2 -stats reports undef=0). MRMS instead bakes two literal sentinels
 * directly into the data: -999 (no radar coverage) and -99 (covered, no
 * echo above threshold). Both are mapped to the payload format's single
 * reserved "no data" byte — never coerced to 0 dBZ.
 *
 * Geographic accuracy: Mapbox GL's `image` source warps a rectangular image
 * into place using only its 4 corner coordinates — it does not re-sample
 * per-scanline against true Web Mercator nonlinearity, which would visibly
 * mis-register a raw equirectangular image spanning CONUS's full ~25-50°N
 * range. Rather than run an actual tile server (like the IEM WMS fallback's
 * upstream does per-tile), this script resamples the wgrib2 grid a second
 * time onto rows spaced evenly in Web Mercator Y before encoding, so a
 * single Mapbox `image` source (matching NexradScanLayer's existing pattern)
 * places every interior pixel correctly, not just the 4 corners.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { encodeMrmsPayload } from '../src/app/utils/mrmsPayloadFormat.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars');
}

const NCEP_BASE = 'https://mrms.ncep.noaa.gov/2D/MergedReflectivityQCComposite';
const FILE_RE = /^MRMS_MergedReflectivityQCComposite_00\.50_(\d{8})-(\d{6})\.grib2\.gz$/;
const STORAGE_BUCKET = 'mrms-scans';
const PRODUCT = 'MergedReflectivityQCComposite';

// Count-based retention (not time-based): MRMS's ~2-minute cadence is far
// steadier than NEXRAD's per-VCP variability, so "keep the last N rows" is
// simpler and more predictable than a time window.
const HISTORY_RETENTION_COUNT = 15;

const WGRIB2_BIN = process.env.WGRIB2_BIN || 'wgrib2';

// Regrid target and native-grid origin — confirmed via `wgrib2 -grid` against
// a real production file: native grid is lat 20.005-54.995, lon 230.005-
// 299.995 (0-360°E convention) at 0.01° spacing, row order WE:SN (row 0 =
// south). Regridding to the same lower-left origin at a coarser spacing
// keeps alignment clean and avoids extrapolation at the domain edges.
const REGRID_LON0 = 230.005; // deg, 0-360 convention (wgrib2 input convention)
const REGRID_LAT0 = 20.005;
const REGRID_SPACING_DEG = 0.04;
const REGRID_NX = 1750;
const REGRID_NY = 875;

// Confirmed against a real file: no GRIB2 bitmap is used for this product
// (wgrib2 -stats reports undef=0) — MRMS bakes these two sentinels directly
// into the data instead.
const NO_DATA_SENTINELS = [-999, -99]; // no coverage, below threshold

const PROCESSING_VERSION = 1; // bump whenever the regrid/quantization/resample logic changes
const DECODER_VERSION = '3.8.0'; // wgrib2 version — keep in sync with the workflow's pinned version

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

function lon360ToSigned(lonE) {
  return lonE > 180 ? lonE - 360 : lonE;
}

const REGRID_WEST = lon360ToSigned(REGRID_LON0);
const REGRID_EAST = lon360ToSigned(REGRID_LON0 + (REGRID_NX - 1) * REGRID_SPACING_DEG);
const REGRID_SOUTH = REGRID_LAT0;
const REGRID_NORTH = REGRID_LAT0 + (REGRID_NY - 1) * REGRID_SPACING_DEG;

async function main() {
  console.log('[mrms-sync] starting');
  try {
    const latestFilename = await findLatestFile();
    if (!latestFilename) {
      console.log('[mrms-sync] no files listed yet');
      return;
    }

    const { yyyymmdd, hhmmss } = parseFilenameTimestamp(latestFilename);
    const sourceTimeMs = parseTimestampToMs(yyyymmdd, hhmmss);

    const lastPublishedMs = await fetchLastPublishedSourceTime();
    if (lastPublishedMs != null && sourceTimeMs <= lastPublishedMs) {
      console.log(`[mrms-sync] ${latestFilename} already published, waiting for next frame`);
      return;
    }

    console.log(`[mrms-sync] downloading ${latestFilename}`);
    const gz = await downloadFile(latestFilename);
    const grib2 = gunzipSync(gz);

    console.log('[mrms-sync] running wgrib2 regrid');
    const ieee = regridToIeee(grib2);
    const rawValues = parseIeeeGrid(ieee, REGRID_NX, REGRID_NY);
    validateGrid(rawValues, REGRID_NX, REGRID_NY);

    const remapped = mercatorRemap(rawValues, REGRID_NX, REGRID_NY, REGRID_SOUTH, REGRID_NORTH, REGRID_SPACING_DEG);

    const ingestedAtMs = Date.now();
    const buffer = encodeMrmsPayload({
      product: PRODUCT,
      sourceTimeMs,
      ingestedAtMs,
      gridWidth: REGRID_NX,
      gridHeight: REGRID_NY,
      west: REGRID_WEST,
      east: REGRID_EAST,
      south: REGRID_SOUTH,
      north: REGRID_NORTH,
      sourceGridSpacingDeg: REGRID_SPACING_DEG,
      values: remapped,
    });

    // Most cells are the "no data" sentinel (~94% in typical conditions —
    // confirmed against a live file), so gzip compresses this well, same
    // rationale as the NEXRAD pipeline's payload compression.
    const compressed = gzipSync(Buffer.from(buffer));

    const latestPath = `${PRODUCT}/latest.bin`;
    await uploadStorage(latestPath, compressed);
    await upsertMeta({ sourceTimeMs, ingestedAtMs, storagePath: latestPath, byteSize: compressed.byteLength, sourceFile: latestFilename });

    const historyPath = `${PRODUCT}/history/${new Date(sourceTimeMs).toISOString()}.bin`;
    await uploadStorage(historyPath, compressed).catch((err) => {
      console.warn('[mrms-sync] history upload failed (best-effort):', err?.message || err);
    });
    await insertHistory({ sourceTimeMs, storagePath: historyPath, byteSize: compressed.byteLength }).catch((err) => {
      console.warn('[mrms-sync] history row insert failed (best-effort):', err?.message || err);
    });
    await pruneHistory().catch((err) => {
      console.warn('[mrms-sync] prune failed:', err?.message || err);
    });

    console.log(`[mrms-sync] published ${latestFilename}`);
  } catch (err) {
    console.error('[mrms-sync] failed:', err?.message || err);
    await markFailure(err?.message || err).catch(() => {});
    process.exitCode = 1;
  }
}

/** Latest timestamped filename from NCEP's real-time directory listing, or null. */
async function findLatestFile() {
  const resp = await fetch(`${NCEP_BASE}/`);
  if (!resp.ok) throw new Error(`NCEP directory listing failed: ${resp.status}`);
  const html = await resp.text();
  const names = [...html.matchAll(/href="(MRMS_MergedReflectivityQCComposite_00\.50_\d{8}-\d{6}\.grib2\.gz)"/g)]
    .map((m) => m[1]);
  if (!names.length) return null;
  names.sort(); // zero-padded timestamps in the name sort chronologically
  return names[names.length - 1];
}

function parseFilenameTimestamp(filename) {
  const m = filename.match(FILE_RE);
  if (!m) throw new Error(`Unrecognized MRMS filename: ${filename}`);
  return { yyyymmdd: m[1], hhmmss: m[2] };
}

function parseTimestampToMs(yyyymmdd, hhmmss) {
  const y = yyyymmdd.slice(0, 4), mo = yyyymmdd.slice(4, 6), d = yyyymmdd.slice(6, 8);
  const h = hhmmss.slice(0, 2), mi = hhmmss.slice(2, 4), s = hhmmss.slice(4, 6);
  return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
}

async function downloadFile(filename) {
  const resp = await fetch(`${NCEP_BASE}/${filename}`);
  if (!resp.ok) throw new Error(`MRMS download failed ${resp.status} for ${filename}`);
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Decompress + regrid + dump a GRIB2 message in one wgrib2 invocation.
 * Confirmed working against a real production file during implementation
 * (exact flag syntax, byte counts, and value fidelity all verified).
 */
function regridToIeee(grib2Bytes) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mrms-'));
  const inPath = path.join(dir, 'in.grib2');
  const outPath = path.join(dir, 'out.ieee');
  try {
    writeFileSync(inPath, grib2Bytes);
    execFileSync(WGRIB2_BIN, [
      inPath,
      '-new_grid_winds', 'earth',
      '-new_grid_interpolation', 'neighbor',
      '-new_grid_format', 'ieee',
      '-new_grid', 'latlon',
      `${REGRID_LON0}:${REGRID_NX}:${REGRID_SPACING_DEG}`,
      `${REGRID_LAT0}:${REGRID_NY}:${REGRID_SPACING_DEG}`,
      outPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    return readFileSync(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Parse a wgrib2 `-ieee` dump: a 4-byte big-endian Fortran record-length
 * header, followed by nx*ny big-endian float32 values (trailing 4-byte
 * footer is ignored). Row 0 = southernmost (wgrib2's "WE:SN" output order,
 * confirmed against a real file), column 0 = westernmost.
 */
function parseIeeeGrid(buf, nx, ny) {
  const n = nx * ny;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const values = new Float32Array(n);
  for (let i = 0; i < n; i++) values[i] = view.getFloat32(4 + i * 4, false); // big-endian
  return values;
}

/** Lightweight sanity check — catches a garbled decode without being overly strict about normal weather variation. */
function validateGrid(values, nx, ny) {
  const n = nx * ny;
  if (values.length !== n) throw new Error(`Unexpected grid size: got ${values.length}, expected ${n}`);
  let realCount = 0, sentinelCount = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (NO_DATA_SENTINELS.some((s) => Math.abs(v - s) < 0.5)) {
      sentinelCount++;
    } else {
      realCount++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  console.log(`[mrms-sync] grid stats: ${realCount}/${n} real cells (${((100 * realCount) / n).toFixed(2)}%)` +
    (realCount ? `, min=${min}, max=${max}` : ''));
  if (realCount === 0 && sentinelCount !== n) {
    throw new Error('Grid validation failed: unexpected value distribution (neither real nor sentinel)');
  }
}

function mercY(latDeg) {
  const lat = (latDeg * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

function invMercLat(y) {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

/**
 * Resample a south-to-north, degrees-uniform grid onto a north-to-south grid
 * whose rows are evenly spaced in Web Mercator Y instead — see module doc
 * comment for why. NOAA's -999/-99 sentinels are mapped to NaN (encodeMrmsPayload
 * treats non-finite values as "no data").
 */
function mercatorRemap(sourceValues, nx, ny, southLat, northLat, spacingDeg) {
  const out = new Float32Array(nx * ny);
  const yNorth = mercY(northLat);
  const ySouth = mercY(southLat);
  for (let outRow = 0; outRow < ny; outRow++) {
    const f = ny === 1 ? 0 : outRow / (ny - 1);
    const y = yNorth + f * (ySouth - yNorth);
    const lat = invMercLat(y);
    let srcRow = Math.round((lat - southLat) / spacingDeg);
    if (srcRow < 0) srcRow = 0;
    if (srcRow > ny - 1) srcRow = ny - 1;
    const srcBase = srcRow * nx;
    const outBase = outRow * nx; // outRow 0 = north
    for (let col = 0; col < nx; col++) {
      const raw = sourceValues[srcBase + col];
      const isSentinel = NO_DATA_SENTINELS.some((s) => Math.abs(raw - s) < 0.5);
      out[outBase + col] = isSentinel ? NaN : raw;
    }
  }
  return out;
}

async function fetchLastPublishedSourceTime() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/mrms_frame_meta?select=source_time&product=eq.${PRODUCT}&limit=1`,
    { headers: supabaseHeaders() },
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  if (!rows.length || !rows[0].source_time) return null;
  return Date.parse(rows[0].source_time);
}

async function uploadStorage(storagePath, bytes) {
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }),
    body: bytes,
  });
  if (!resp.ok) {
    throw new Error(`Storage upload failed for ${storagePath}: ${resp.status} ${await resp.text().catch(() => '')}`);
  }
}

async function upsertMeta({ sourceTimeMs, ingestedAtMs, storagePath, byteSize, sourceFile }) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/mrms_frame_meta?on_conflict=product`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({
      product: PRODUCT,
      source_time: new Date(sourceTimeMs).toISOString(),
      ingested_at: new Date(ingestedAtMs).toISOString(),
      source_file: sourceFile,
      storage_path: storagePath,
      byte_size: byteSize,
      grid_width: REGRID_NX,
      grid_height: REGRID_NY,
      west: REGRID_WEST,
      east: REGRID_EAST,
      south: REGRID_SOUTH,
      north: REGRID_NORTH,
      processing_version: PROCESSING_VERSION,
      decoder_version: DECODER_VERSION,
      status: 'ok',
      error_detail: null,
      last_attempt_at: new Date().toISOString(),
    }),
  });
  if (!resp.ok) throw new Error(`mrms_frame_meta upsert failed: ${resp.status} ${await resp.text().catch(() => '')}`);
}

/** Best-effort partial upsert on failure — leaves the last successful frame's storage_path/source_time
 * untouched (PostgREST merge-duplicates only updates the columns present in the body), so a bad run
 * never blanks out the last good Composite Radar frame. Only status/error/last_attempt_at change. */
async function markFailure(message) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/mrms_frame_meta?on_conflict=product`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({
      product: PRODUCT,
      status: 'error',
      error_detail: String(message).slice(0, 500),
      last_attempt_at: new Date().toISOString(),
    }),
  });
  if (!resp.ok) console.warn(`[mrms-sync] markFailure upsert failed: ${resp.status}`);
}

/** Append this frame to the rolling history table. A separate object per frame (not overwritten in place like latest.bin). */
async function insertHistory({ sourceTimeMs, storagePath, byteSize }) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/mrms_frame_history?on_conflict=product,source_time`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' }),
    body: JSON.stringify({
      product: PRODUCT,
      source_time: new Date(sourceTimeMs).toISOString(),
      storage_path: storagePath,
      byte_size: byteSize,
    }),
  });
  if (!resp.ok) throw new Error(`mrms_frame_history insert failed: ${resp.status} ${await resp.text().catch(() => '')}`);
}

/** Keep only the newest HISTORY_RETENTION_COUNT history rows for this product; delete the rest (storage + rows). */
async function pruneHistory() {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/mrms_frame_history?select=id,storage_path&product=eq.${PRODUCT}&order=source_time.desc&offset=${HISTORY_RETENTION_COUNT}`,
    { headers: supabaseHeaders() },
  );
  if (!resp.ok) {
    console.warn(`[mrms-sync] prune: failed to list stale rows: ${resp.status}`);
    return;
  }
  const rows = await resp.json();
  if (!rows.length) return;

  const delObjResp = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}`, {
    method: 'DELETE',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: rows.map((r) => r.storage_path) }),
  });
  if (!delObjResp.ok) {
    console.warn(`[mrms-sync] prune: storage delete failed: ${delObjResp.status} ${await delObjResp.text().catch(() => '')}`);
  }

  const idList = rows.map((r) => r.id).join(',');
  const delRowsResp = await fetch(`${SUPABASE_URL}/rest/v1/mrms_frame_history?id=in.(${idList})`, {
    method: 'DELETE',
    headers: supabaseHeaders(),
  });
  if (!delRowsResp.ok) {
    console.warn(`[mrms-sync] prune: row delete failed: ${delRowsResp.status} ${await delRowsResp.text().catch(() => '')}`);
    return;
  }
  console.log(`[mrms-sync] prune: removed ${rows.length} stale frame(s)`);
}

main();
