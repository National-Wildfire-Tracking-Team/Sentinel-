/**
 * nexrad-radar-sync.mjs
 * Decodes live NWS NEXRAD Level II radar data (reflectivity, velocity,
 * spectrum width, differential reflectivity, correlation coefficient — all
 * base tilt) for whichever radar sites someone currently has open in Sentinel, and
 * publishes a compact pre-processed payload to Supabase for the frontend to
 * render. Run on a schedule by .github/workflows/nexrad-radar-sync.yml,
 * mirroring the existing scripts/opensky-sync.mjs pattern (plain Node, raw
 * REST calls to Supabase with the service-role key, no @supabase/supabase-js
 * client).
 *
 * Primary data source: the NOAA/Unidata AWS archive bucket
 * "unidata-nexrad-level2" (successor to the discontinued "noaa-nexrad-level2"
 * — see https://www.unidata.ucar.edu/blogs/news/entry/important-changes-to-noaa-nexrad),
 * which serves one complete Archive II Level II object per finished volume
 * scan, keyed "<YYYY>/<MM>/<DD>/<SITE>/<SITE><YYYYMMDD>_<HHMMSS>_V06" — a
 * flat-per-day, chronologically-sortable listing per site, publicly
 * listable/GETable over plain HTTPS with no AWS credentials. New volumes
 * appear roughly every 3-8 minutes. The listing also contains interleaved
 * "..._V06_MDM" metadata sidecar objects, which are filtered out (they are
 * not radar volumes).
 *
 * This bucket is a proper archive-style listing (unlike Unidata's real-time
 * S3 "chunks" bucket, unidata-nexrad-level2-chunks, whose per-site "volume
 * scan number" folders cycle 0-999 with no timestamp in the folder name,
 * making "the current volume" unreliable to find via prefix listing alone —
 * AWS's own docs say the intended way to consume that bucket in real time is
 * an SNS/SQS subscription, which needs an AWS account this project doesn't
 * otherwise use), so it gets the same "just list and take the chronological
 * max" simplicity tgftp.nws.noaa.gov offered, without depending on a
 * non-AWS mirror.
 *
 * tgftp.nws.noaa.gov is kept as an automatic fallback (see findLatestFile)
 * for this migration: if the AWS bucket is unreachable or briefly empty for
 * a site, the sync falls back to the original tgftp directory-listing path.
 * Remove the tgftp fallback in a later change once the AWS path has proven
 * stable in production.
 *
 * The Archive II file bytes are identical either way (starts with the
 * "AR2V0006." magic) — bzip2 compression is applied internally per-record
 * exactly as the nexrad-level-2-data library already expects, not as a
 * whole-file wrapper, so no separate decompression step is needed regardless
 * of which source served the file.
 *
 * Split-cut VCPs (e.g. VCP 212) scan reflectivity and velocity at the same
 * tilt angle as two separate "elevation" entries rather than one — verified
 * against a real live KTLX volume during implementation: elevation 1 had
 * reflectivity for all 720 radials and velocity for none, elevation 2 had
 * both. So each product searches a small set of candidate elevations
 * independently and uses the lowest one that actually has data, instead of
 * assuming both live at elevation 1.
 */

import { gzipSync } from 'node:zlib';
import Level2Radar from 'nexrad-level-2-data';
import { XMLParser } from 'fast-xml-parser';
import { encodeScanPayload } from '../src/app/utils/nexradPayloadFormat.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars');
}

const AWS_NEXRAD_BASE = 'https://unidata-nexrad-level2.s3.amazonaws.com';
const AWS_VOLUME_FILE_RE = /^[A-Z]{4}\d{8}_\d{6}_V06$/;
const TGFTP_BASE = 'https://tgftp.nws.noaa.gov/data/radar/nexrad_level2';
const STORAGE_BUCKET = 'nexrad-scans';
const xmlParser = new XMLParser();
const ACTIVE_WINDOW_MS = 15 * 60 * 1000; // sites with no heartbeat in this long are ignored
const CONCURRENCY = 4;
const MIN_RADIALS = 300; // sanity floor: a real base-tilt cut has 360-720 radials
const ELEVATION_CANDIDATES = [1, 2, 3, 4]; // see split-cut note above

// The site radar popup's scrub bar exposes 2 hours of history; keep a little
// past that so a scan at the very edge of the slider is never missing.
const HISTORY_RETENTION_MS = 2 * 60 * 60 * 1000 + 15 * 60 * 1000;
const HISTORY_PRUNE_BATCH = 500;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function main() {
  console.log('[nexrad-sync] starting');

  const activeSites = await fetchActiveSites();
  console.log(`[nexrad-sync] ${activeSites.length} active site(s)`);
  if (!activeSites.length) {
    console.log('[nexrad-sync] nothing to do');
    return;
  }

  const publishedFiles = await fetchPublishedSourceFiles(activeSites.map((s) => s.site_id));

  let cursor = 0;
  async function worker() {
    while (cursor < activeSites.length) {
      const site = activeSites[cursor++];
      try {
        await syncSite(site.site_id, publishedFiles.get(site.site_id) ?? null);
      } catch (err) {
        console.warn(`[nexrad-sync] ${site.site_id} failed:`, err?.message || err);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, activeSites.length) }, worker),
  );

  try {
    await pruneHistory();
  } catch (err) {
    console.warn('[nexrad-sync] prune failed:', err?.message || err);
  }

  console.log('[nexrad-sync] done');
}

async function fetchActiveSites() {
  const staleIso = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/nexrad_active_sites?select=site_id&last_seen_at=gte.${encodeURIComponent(staleIso)}`,
    { headers: supabaseHeaders() },
  );
  if (!resp.ok) throw new Error(`Failed to list active sites: ${resp.status} ${await resp.text().catch(() => '')}`);
  return resp.json();
}

/**
 * Extract the embedded "YYYYMMDD_HHMMSS" timestamp from either AWS
 * ("KMLB20260910_153125_V06") or tgftp ("KMLB_20260910_153125.bz2") filename
 * formats, for comparing "is this newer than the last published volume"
 * across sources. The two raw formats are NOT safely string-comparable
 * against each other — confirmed live: an AWS-format key always sorts
 * lexicographically before a tgftp-format filename regardless of actual
 * chronological order (digits vs. the site's own letters), which without
 * this normalization could make the sync perpetually treat every subsequent
 * AWS volume as "already published" once a single tgftp-sourced scan (e.g.
 * from nexrad-heartbeat's own fallback path) had been recorded — silently
 * starving both the live feed's freshness and, critically, history writes,
 * since nothing downstream would ever see a volume as new again.
 */
function timestampKey(filename) {
  const m = filename.match(/(\d{8}_\d{6})/);
  return m ? m[1] : filename;
}

async function fetchPublishedSourceFiles(siteIds) {
  const map = new Map();
  if (!siteIds.length) return map;

  const inList = siteIds.map((s) => `"${s}"`).join(',');
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/nexrad_scan_meta?select=site_id,source_file&site_id=in.(${inList})`,
    { headers: supabaseHeaders() },
  );
  if (!resp.ok) throw new Error(`Failed to fetch published source files: ${resp.status}`);

  const rows = await resp.json();
  for (const row of rows) {
    // Compare by normalized timestamp (not raw filename) since a site's two
    // product rows may have been published from different sources.
    const prev = map.get(row.site_id);
    if (row.source_file && (!prev || timestampKey(row.source_file) > timestampKey(prev))) {
      map.set(row.site_id, row.source_file);
    }
  }
  return map;
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

/**
 * List one UTC date's volume-file keys for a site from the NOAA/Unidata AWS
 * archive bucket, filtered to real "_V06" volumes (excludes the interleaved
 * "_V06_MDM" metadata sidecar objects). Returns full object keys, which sort
 * chronologically as strings — same property the tgftp filenames had.
 */
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

/**
 * Latest AWS volume key for a site, or null if the bucket has nothing yet.
 * Falls back to yesterday's UTC date so a call made just after UTC midnight
 * doesn't come up empty while today's first volume is still in flight.
 */
async function findLatestAwsFile(site) {
  const todayKeys = await listAwsVolumeKeys(site, utcDateParts(0));
  if (todayKeys.length) return todayKeys[todayKeys.length - 1];
  const yesterdayKeys = await listAwsVolumeKeys(site, utcDateParts(-1));
  return yesterdayKeys.length ? yesterdayKeys[yesterdayKeys.length - 1] : null;
}

async function downloadAwsFile(key) {
  const resp = await fetch(`${AWS_NEXRAD_BASE}/${key}`);
  if (!resp.ok) throw new Error(`AWS NEXRAD download failed ${resp.status} for ${key}`);
  return new Uint8Array(await resp.arrayBuffer());
}

/** Latest filename for a site from tgftp's plain-text directory index, or
 * null if unavailable. Migration fallback only — see module doc comment. */
async function findLatestTgftpFile(site) {
  const resp = await fetch(`${TGFTP_BASE}/${site}/dir.list`);
  if (!resp.ok) throw new Error(`dir.list fetch failed ${resp.status} for ${site}`);
  const text = await resp.text();

  // Each line: "<size> <filename>"
  const filenames = text
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((name) => name && name.startsWith(`${site}_`) && name.endsWith('.bz2'));

  if (!filenames.length) return null;
  filenames.sort(); // zero-padded timestamps in the name sort chronologically
  return filenames[filenames.length - 1];
}

async function downloadTgftpFile(site, filename) {
  const resp = await fetch(`${TGFTP_BASE}/${site}/${filename}`);
  if (!resp.ok) throw new Error(`File download failed ${resp.status} for ${site}/${filename}`);
  return new Uint8Array(await resp.arrayBuffer());
}

/**
 * Latest volume for a site: { source: 'aws'|'tgftp', filename } or null.
 * Prefers the NOAA/Unidata AWS archive; falls back to tgftp if AWS is
 * unreachable or has no volumes yet for this site. NOTE: source_file's
 * high-water-mark comparison in syncSite() assumes same-source filenames
 * sort chronologically against each other — comparing an AWS key against a
 * tgftp filename (only possible right at a fallback transition) may rarely
 * cause one extra republish of an already-published volume, which is
 * harmless.
 */
async function findLatestFile(site) {
  try {
    const awsKey = await findLatestAwsFile(site);
    if (awsKey) return { source: 'aws', filename: awsKey };
    console.warn(`[nexrad-sync] ${site}: AWS archive has no volumes yet, falling back to tgftp`);
  } catch (err) {
    console.warn(`[nexrad-sync] ${site}: AWS listing failed (${err?.message || err}), falling back to tgftp`);
  }

  const tgftpFile = await findLatestTgftpFile(site);
  return tgftpFile ? { source: 'tgftp', filename: tgftpFile } : null;
}

async function downloadFile(site, volume) {
  return volume.source === 'aws'
    ? downloadAwsFile(volume.filename)
    : downloadTgftpFile(site, volume.filename);
}

/** NEXRAD "modified Julian date" = days since Dec 31, 1969 (day 1 = Jan 1, 1970). */
function julianToEpochMs(modifiedJulianDate, milliseconds) {
  return (modifiedJulianDate - 1) * 86400000 + milliseconds;
}

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Find the lowest-tilt elevation where the given product getter actually
 * returns data (handles split-cut VCPs where reflectivity and velocity live
 * at different elevation numbers for the same physical tilt angle).
 */
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

async function syncSite(site, lastPublishedFile) {
  const latest = await findLatestFile(site);
  if (!latest) {
    console.log(`[nexrad-sync] ${site}: no files listed yet`);
    return;
  }
  const { filename: latestFile } = latest;
  if (lastPublishedFile != null && timestampKey(latestFile) <= timestampKey(lastPublishedFile)) {
    console.log(`[nexrad-sync] ${site}: ${latestFile} already published, waiting for next volume`);
    return;
  }

  console.log(`[nexrad-sync] ${site}: downloading ${latestFile} (${latest.source})`);
  const bytes = await downloadFile(site, latest);

  let radar;
  try {
    radar = new Level2Radar(bytes);
  } catch (err) {
    console.warn(`[nexrad-sync] ${site}: decode failed:`, err?.message || err);
    return;
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

  if (!jobs.length) {
    console.log(`[nexrad-sync] ${site}: no usable radar data in ${latestFile}`);
    return;
  }

  await Promise.all(jobs);
  console.log(`[nexrad-sync] ${site}: published ${latestFile}`);
}

const MS_TO_KNOTS = 1.943844;

async function publishProduct({ site, product, elevationDeg, azimuths, radials, scanTimeMs, sourceFile }) {
  const first = radials.find(Boolean);
  const gateCount = first.gate_count;
  // nexrad-level-2-data returns gate_size/first_gate in KILOMETERS (e.g.
  // 0.25, 2.125 for a standard super-res reflectivity cut), not meters —
  // confirmed against real decoded output. Convert to meters here since
  // the payload format (and the frontend's georeferencing math) is in
  // meters throughout.
  const gateSizeM = first.gate_size * 1000;
  const firstGateM = first.first_gate * 1000;
  // Radials with no data for this product (e.g. a gap in a split-cut scan)
  // are encoded as all-no-data rather than skipped, so the array stays
  // aligned with `azimuths`.
  //
  // Velocity: the WSR-88D ICD defines native RDA velocity resolution in m/s
  // (confirmed against a live decode: the VCP's velocity_resolution field
  // read 0.5, matching the ICD's documented 0.5 m/s super-res mode, not a
  // knots value) — convert to knots here since that's the NWS-conventional
  // display unit used everywhere else in this app (see RADAR_DBZ_SCALE-style
  // legends), so the quantization range and UI labels don't have to guess.
  // Spectrum width shares velocity's Doppler message (same scale/offset
  // metadata, confirmed against real decoded output for two different real
  // sites/VCPs) and is native m/s too — converted for the same reason.
  // ZDR (dB) and CC (unitless) are used as the decoder returns them.
  const unitConvert = (product === 'velocity' || product === 'spectrumWidth')
    ? (v) => v * MS_TO_KNOTS
    : (v) => v;
  const moments = radials.map((r) => (r?.moment_data ?? []).map((v) => (v == null ? v : unitConvert(v))));

  const buffer = encodeScanPayload({
    siteId: site,
    product,
    scanTimeMs,
    elevationDeg,
    azimuths,
    gateCount,
    gateSizeM,
    firstGateM,
    moments,
  });

  // Most gates are the "no data" sentinel byte (typically 75-85% of the
  // buffer), so gzip compresses this extremely well — cuts a ~1.3MB
  // reflectivity payload down to a few hundred KB, which is the difference
  // between a snappy and a sluggish-feeling panel on a real connection.
  // The frontend always decompresses explicitly (DecompressionStream), so
  // this isn't relying on the CDN forwarding Content-Encoding correctly.
  const compressed = gzipSync(Buffer.from(buffer));

  const storagePath = `${site}/${product}/latest.bin`;

  const uploadResp = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`,
    {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true',
      }),
      body: compressed,
    },
  );
  if (!uploadResp.ok) {
    throw new Error(`Storage upload failed for ${storagePath}: ${uploadResp.status} ${await uploadResp.text().catch(() => '')}`);
  }

  const metaResp = await fetch(
    `${SUPABASE_URL}/rest/v1/nexrad_scan_meta?on_conflict=site_id,product`,
    {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      }),
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
    },
  );
  if (!metaResp.ok) {
    throw new Error(`Scan meta upsert failed for ${site}/${product}: ${metaResp.status} ${await metaResp.text().catch(() => '')}`);
  }

  // Best-effort: append this scan to the rolling history table that backs the
  // site radar popup's scrub bar. A failure here shouldn't fail the live feed.
  await publishHistoryEntry({
    site, product, scanTimeMs, elevationDeg, compressed, gateCount, radialCount: azimuths.length,
  }).catch((err) => {
    console.warn(`[nexrad-sync] ${site}/${product}: history publish failed:`, err?.message || err);
  });
}

/** Append one scan to nexrad_scan_history — a separate object per scan (not overwritten in place like latest.bin). */
async function publishHistoryEntry({ site, product, scanTimeMs, elevationDeg, compressed, gateCount, radialCount }) {
  const scanTimeIso = new Date(scanTimeMs).toISOString();
  const historyPath = `${site}/${product}/history/${scanTimeIso}.bin`;

  const uploadResp = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${historyPath}`,
    {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true',
        // Unlike latest.bin (overwritten in place every cycle, so it must
        // stay revalidate-on-every-request), this path is unique per scan
        // and never rewritten once published — genuinely immutable, so it's
        // safe to tell every intermediate cache to never bother revalidating.
        'Cache-Control': 'public, max-age=31536000, immutable',
      }),
      body: compressed,
    },
  );
  if (!uploadResp.ok) {
    throw new Error(`History storage upload failed for ${historyPath}: ${uploadResp.status} ${await uploadResp.text().catch(() => '')}`);
  }

  const insertResp = await fetch(
    `${SUPABASE_URL}/rest/v1/nexrad_scan_history?on_conflict=site_id,product,scan_time`,
    {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      }),
      body: JSON.stringify({
        site_id: site,
        product,
        scan_time: scanTimeIso,
        elevation_deg: elevationDeg,
        storage_path: historyPath,
        byte_size: compressed.byteLength,
        gate_count: gateCount,
        radial_count: radialCount,
      }),
    },
  );
  if (!insertResp.ok) {
    throw new Error(`History row insert failed for ${site}/${product}@${scanTimeIso}: ${insertResp.status} ${await insertResp.text().catch(() => '')}`);
  }
}

/** Delete history rows (and their storage objects) past the retention window. */
async function pruneHistory() {
  const cutoffIso = new Date(Date.now() - HISTORY_RETENTION_MS).toISOString();
  const listResp = await fetch(
    `${SUPABASE_URL}/rest/v1/nexrad_scan_history?select=id,storage_path&scan_time=lt.${encodeURIComponent(cutoffIso)}&limit=${HISTORY_PRUNE_BATCH}`,
    { headers: supabaseHeaders() },
  );
  if (!listResp.ok) {
    console.warn(`[nexrad-sync] prune: failed to list stale history rows: ${listResp.status}`);
    return;
  }

  const rows = await listResp.json();
  if (!rows.length) return;

  const deleteObjResp = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}`, {
    method: 'DELETE',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: rows.map((r) => r.storage_path) }),
  });
  if (!deleteObjResp.ok) {
    // A dangling object in a public bucket is harmless (unreferenced once its
    // row is gone) — still drop the rows below so the table doesn't grow forever.
    console.warn(`[nexrad-sync] prune: storage delete failed: ${deleteObjResp.status} ${await deleteObjResp.text().catch(() => '')}`);
  }

  const idList = rows.map((r) => r.id).join(',');
  const deleteRowsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/nexrad_scan_history?id=in.(${idList})`,
    { method: 'DELETE', headers: supabaseHeaders() },
  );
  if (!deleteRowsResp.ok) {
    console.warn(`[nexrad-sync] prune: row delete failed: ${deleteRowsResp.status} ${await deleteRowsResp.text().catch(() => '')}`);
    return;
  }
  console.log(`[nexrad-sync] prune: removed ${rows.length} stale history row(s)`);
}

main().catch((err) => {
  console.error('[nexrad-sync] fatal:', err);
  process.exit(1);
});
