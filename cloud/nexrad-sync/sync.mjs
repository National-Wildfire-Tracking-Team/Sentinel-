/**
 * sync.mjs
 * Decodes live NWS NEXRAD Level II radar data (reflectivity, velocity,
 * spectrum width, differential reflectivity, correlation coefficient — all
 * base tilt) and publishes a compact pre-processed payload to Google Cloud
 * for the frontend to render. Runs as a Google Cloud Run Job, triggered
 * every 2 minutes by Cloud Scheduler (see README.md for deploy steps).
 *
 * Metadata (nexradScanMeta / nexradScanHistory / nexradActiveSites) lives in
 * Firestore; binary payloads live in Google Cloud Storage — both part of
 * the project's move off Supabase. No explicit credentials are configured
 * for either client: this job's Cloud Run service account already has
 * Application Default Credentials available in the container, so it only
 * needs the right IAM roles granted (see README.md) — same pattern this job
 * already used for Secret Manager before the Supabase secrets it read went
 * away entirely.
 *
 * Every known NEXRAD site (from NWS's public station list, see
 * fetchAllNexradSites) gets reflectivity synced every run — that's all the
 * Composite Radar layer needs to render each site's own sweep as its own map
 * layer (see radarRaster.js's rasterizeSweep / NexradScanLayer.jsx /
 * RadarLayer.jsx; there's no MRMS-style national grid or cross-site
 * blending). Whichever sites someone currently has open in Sentinel's
 * single-site detail view (tracked via the nexradActiveSites heartbeat)
 * additionally get every other product, since only that per-site view uses
 * velocity/spectrum width/ZDR/CC. See buildProductPlan below.
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
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { encodeScanPayload } from './nexradPayloadFormat.js';

const GCS_BUCKET = process.env.NEXRAD_SCANS_BUCKET;
if (!GCS_BUCKET) {
  throw new Error('Missing NEXRAD_SCANS_BUCKET env var');
}

// No explicit project/credentials — both clients pick up the Cloud Run
// service account's Application Default Credentials automatically. See
// module doc comment. databaseId must be explicit: the project's Firestore
// database is a named database ("nexrad-composite"), not "(default)" — every
// Firestore client in this pipeline (this one, the browser, cloud/nexrad-heartbeat)
// must agree on this same ID.
const FIRESTORE_DATABASE_ID = 'nexrad-composite';
const firestore = new Firestore({ databaseId: FIRESTORE_DATABASE_ID });
const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET);

const AWS_NEXRAD_BASE = 'https://unidata-nexrad-level2.s3.amazonaws.com';
const AWS_VOLUME_FILE_RE = /^[A-Z]{4}\d{8}_\d{6}_V06$/;
const TGFTP_BASE = 'https://tgftp.nws.noaa.gov/data/radar/nexrad_level2';
const NWS_STATIONS_URL = 'https://api.weather.gov/radar/stations';
const xmlParser = new XMLParser();
const ACTIVE_WINDOW_MS = 15 * 60 * 1000; // sites with no heartbeat in this long are ignored
// Firestore's `in` operator caps at 30 values per query — batch site-id
// lookups into chunks this size (see fetchPublishedSourceFiles).
const FIRESTORE_IN_CHUNK_SIZE = 30;
// Every known site (~200) now gets synced every run, not just a handful of
// actively-viewed ones — more in-flight network fetches needed to finish
// inside the workflow's timeout-minutes budget. Lowered from an initial 16:
// confirmed live on Cloud Run that 16 concurrent full-volume decodes (each
// holding sizable radial/moment arrays) OOM'd even a 2Gi container — each
// decode is memory-heavy enough that concurrency, not just raw memory, has
// to come down too. Revisit after watching real run times/memory in
// production.
const CONCURRENCY = 6;
const MIN_RADIALS = 300; // sanity floor: a real base-tilt cut has 360-720 radials
const ELEVATION_CANDIDATES = [1, 2, 3, 4]; // see split-cut note above

// Composite Radar (every site) only ever needs reflectivity. Single-site
// detail view (RadarSitePanel.jsx) offers all five — see module doc comment.
const ALL_PRODUCTS = ['reflectivity', 'velocity', 'spectrumWidth', 'zdr', 'cc'];
const REFLECTIVITY_ONLY = ['reflectivity'];

const PRODUCT_GETTERS = {
  reflectivity: (radar) => radar.getHighresReflectivity(),
  velocity: (radar) => radar.getHighresVelocity(),
  spectrumWidth: (radar) => radar.getHighresSpectrum(),
  zdr: (radar) => radar.getHighresDiffReflectivity(),
  cc: (radar) => radar.getHighresCorrelationCoefficient(),
};

// Retention window, per product, before nexradScanHistory docs are pruned
// (see pruneHistory below) — kept a little past the actual UI window so a
// scan at the very edge of a scrub bar is never missing. Every product now
// backs a 2-hour window: reflectivity for Composite Radar's national
// playback (useNexradComposite.js / nexradScans.js's
// COMPOSITE_HISTORY_WINDOW_MS, cut down from 24h), the rest for the
// single-site radar popup's scrub bar (useNexradScan.js). Kept as a
// per-product map rather than one shared constant since pruning already
// runs per product and the windows have diverged before.
const HISTORY_RETENTION_BY_PRODUCT = {
  reflectivity: 2 * 60 * 60 * 1000 + 15 * 60 * 1000,
  velocity: 2 * 60 * 60 * 1000 + 15 * 60 * 1000,
  spectrumWidth: 2 * 60 * 60 * 1000 + 15 * 60 * 1000,
  zdr: 2 * 60 * 60 * 1000 + 15 * 60 * 1000,
  cc: 2 * 60 * 60 * 1000 + 15 * 60 * 1000,
};
const HISTORY_PRUNE_BATCH = 500;

async function main() {
  console.log('[nexrad-sync] starting');

  const [activeSiteIds, allSiteIds] = await Promise.all([
    fetchActiveSiteIds(),
    fetchAllNexradSites().catch((err) => {
      console.warn('[nexrad-sync] failed to fetch full site list, composite sync skipped this run:', err?.message || err);
      return [];
    }),
  ]);

  const productPlan = buildProductPlan(allSiteIds, activeSiteIds);
  const siteIds = [...productPlan.keys()];
  console.log(`[nexrad-sync] ${siteIds.length} site(s) total (${activeSiteIds.length} active, all products)`);
  if (!siteIds.length) {
    console.log('[nexrad-sync] nothing to do');
    return;
  }

  const publishedFiles = await fetchPublishedSourceFiles(siteIds);

  let cursor = 0;
  async function worker() {
    while (cursor < siteIds.length) {
      const site = siteIds[cursor++];
      try {
        await syncSite(site, publishedFiles.get(site) ?? null, productPlan.get(site));
      } catch (err) {
        console.warn(`[nexrad-sync] ${site} failed:`, err?.message || err);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, siteIds.length) }, worker),
  );

  try {
    await pruneHistory();
  } catch (err) {
    console.warn('[nexrad-sync] prune failed:', err?.message || err);
  }

  console.log('[nexrad-sync] done');
}

async function fetchActiveSiteIds() {
  const cutoff = Timestamp.fromMillis(Date.now() - ACTIVE_WINDOW_MS);
  const snap = await firestore
    .collection('nexradActiveSites')
    .where('last_seen_at', '>=', cutoff)
    .select() // doc IDs only, no fields needed
    .get();
  return snap.docs.map((doc) => doc.id);
}

/**
 * All NEXRAD site IDs from NWS's public station list — the authoritative
 * "sync this site's reflectivity for the composite" list. Mirrors
 * src/app/api/nexradSites.js's client-side fetch of the same endpoint;
 * duplicated (not imported) since that module's browser-oriented caching
 * wrapper doesn't apply to this plain-Node script.
 */
async function fetchAllNexradSites() {
  const resp = await fetch(NWS_STATIONS_URL, { headers: { Accept: 'application/geo+json' } });
  if (!resp.ok) throw new Error(`NWS radar stations fetch failed: ${resp.status}`);
  const json = await resp.json();
  const features = Array.isArray(json?.features) ? json.features : [];
  return features.map((f) => f?.properties?.id).filter(Boolean);
}

/**
 * Merge the full site list (reflectivity only, for Composite Radar) with the
 * heartbeat-active list (every product, for the single-site detail view)
 * into one site -> products-to-sync map, so a site never gets double-synced
 * in the same run. An active site absent from the NWS list (shouldn't happen
 * in practice — the client sources its site picker from the same endpoint —
 * but kept defensive) still gets synced with every product.
 */
function buildProductPlan(allSiteIds, activeSiteIds) {
  const plan = new Map();
  for (const siteId of allSiteIds) plan.set(siteId, REFLECTIVITY_ONLY);
  for (const siteId of activeSiteIds) plan.set(siteId, ALL_PRODUCTS);
  return plan;
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
 * from the heartbeat service's own fallback path) had been recorded —
 * silently starving both the live feed's freshness and, critically, history
 * writes, since nothing downstream would ever see a volume as new again.
 */
function timestampKey(filename) {
  const m = filename.match(/(\d{8}_\d{6})/);
  return m ? m[1] : filename;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

/**
 * Per-site highest-water-mark source_file across every product's
 * nexradScanMeta doc for that site (a site might have been synced with
 * different products via different paths — e.g. composite-only reflectivity
 * vs. a heartbeat-primed full set — so the true "already published?" check
 * needs the max across all of them, not just one product's doc).
 * Firestore's `in` operator caps at 30 values, so this batches siteIds into
 * chunks and runs them in parallel.
 */
async function fetchPublishedSourceFiles(siteIds) {
  const map = new Map();
  if (!siteIds.length) return map;

  const chunks = chunk(siteIds, FIRESTORE_IN_CHUNK_SIZE);
  const snaps = await Promise.all(
    chunks.map((c) => firestore.collection('nexradScanMeta').where('site_id', 'in', c).get()),
  );

  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const row = doc.data();
      if (!row.source_file) continue;
      const prev = map.get(row.site_id);
      if (!prev || timestampKey(row.source_file) > timestampKey(prev)) {
        map.set(row.site_id, row.source_file);
      }
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

async function syncSite(site, lastPublishedFile, productsToSync) {
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

  const products = {};
  for (const product of productsToSync) {
    products[product] = findBestElevation(radar, () => PRODUCT_GETTERS[product](radar));
  }

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

  // GCS object writes overwrite in place by default — no explicit upsert
  // flag needed (unlike the old Supabase Storage 'x-upsert' header).
  await bucket.file(storagePath).save(compressed, {
    contentType: 'application/octet-stream',
    resumable: false, // payloads here are at most a couple MB — a single request is simpler and faster than a resumable session
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

  // Best-effort: append this scan to the rolling history collection that
  // backs the site radar popup's scrub bar and Composite Radar's playback.
  // A failure here shouldn't fail the live feed.
  await publishHistoryEntry({
    site, product, scanTimeMs, elevationDeg, compressed, gateCount, radialCount: azimuths.length,
  }).catch((err) => {
    console.warn(`[nexrad-sync] ${site}/${product}: history publish failed:`, err?.message || err);
  });
}

/** Append one scan to nexradScanHistory — a separate object per scan (not overwritten in place like latest.bin). */
async function publishHistoryEntry({ site, product, scanTimeMs, elevationDeg, compressed, gateCount, radialCount }) {
  const scanTimeIso = new Date(scanTimeMs).toISOString();
  // Colons/periods stripped from the timestamp for the storage key — GCS
  // itself allows them, but keeping this format (carried over from the
  // Supabase Storage version of this pipeline, where it was a hard
  // requirement — colon/period-bearing keys silently failed to upload
  // there) avoids any URL-construction subtlety and keeps the key
  // lexicographically sortable either way.
  const historyKey = scanTimeIso.replace(/[:.]/g, '-');
  const historyPath = `${site}/${product}/history/${historyKey}.bin`;
  const docId = `${site}_${product}_${historyKey}`;

  await bucket.file(historyPath).save(compressed, {
    contentType: 'application/octet-stream',
    resumable: false,
    // Unlike latest.bin (overwritten in place every cycle, so it must stay
    // revalidate-on-every-request), this path is unique per scan and never
    // rewritten once published — genuinely immutable, so it's safe to tell
    // every intermediate cache to never bother revalidating.
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
  });

  // Doc ID already encodes (site, product, scan_time) uniqueness, so a
  // plain set() is the idempotent "insert, or harmlessly overwrite with the
  // same data" this needs — the same role Postgres's
  // on_conflict + ignore-duplicates played.
  await firestore.collection('nexradScanHistory').doc(docId).set({
    site_id: site,
    product,
    scan_time: Timestamp.fromMillis(scanTimeMs),
    elevation_deg: elevationDeg,
    storage_path: historyPath,
    byte_size: compressed.byteLength,
    gate_count: gateCount,
    radial_count: radialCount,
    created_at: Timestamp.now(),
  });
}

/** Delete one product's history docs (and their storage objects) past its own retention window. */
async function pruneHistoryForProduct(product, retentionMs) {
  const cutoff = Timestamp.fromMillis(Date.now() - retentionMs);
  const snap = await firestore
    .collection('nexradScanHistory')
    .where('product', '==', product)
    .where('scan_time', '<', cutoff)
    .limit(HISTORY_PRUNE_BATCH)
    .get();

  if (snap.empty) return;

  const results = await Promise.allSettled(
    snap.docs.map((doc) => bucket.file(doc.data().storage_path).delete()),
  );
  const failedDeletes = results.filter((r) => r.status === 'rejected').length;
  if (failedDeletes) {
    // A dangling object is harmless (unreferenced once its doc is gone) —
    // still drop the docs below so the collection doesn't grow forever.
    console.warn(`[nexrad-sync] prune(${product}): ${failedDeletes} storage delete(s) failed`);
  }

  const batch = firestore.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();

  console.log(`[nexrad-sync] prune(${product}): removed ${snap.size} stale history doc(s)`);
}

/** Delete stale history docs for every product, each against its own retention window. */
async function pruneHistory() {
  for (const [product, retentionMs] of Object.entries(HISTORY_RETENTION_BY_PRODUCT)) {
    await pruneHistoryForProduct(product, retentionMs);
  }
}

main().catch((err) => {
  console.error('[nexrad-sync] fatal:', err);
  process.exit(1);
});
