/**
 * nexrad-radar-sync.mjs
 * Decodes live NWS NEXRAD Level II radar data (reflectivity + velocity, base
 * tilt) for whichever radar sites someone currently has open in Sentinel, and
 * publishes a compact pre-processed payload to Supabase for the frontend to
 * render. Run on a schedule by .github/workflows/nexrad-radar-sync.yml,
 * mirroring the existing scripts/opensky-sync.mjs pattern (plain Node, raw
 * REST calls to Supabase with the service-role key, no @supabase/supabase-js
 * client).
 *
 * Data source: tgftp.nws.noaa.gov, which serves one complete Archive II
 * Level II file per finished volume scan, named
 * "{SITE}_{YYYYMMDD}_{HHMMSS}.bz2" in a flat, chronologically-sortable
 * directory per site (plus a plain-text "dir.list" index). New volumes
 * appear roughly every 3-5 minutes.
 *
 * This was switched from Unidata's real-time S3 "chunks" bucket
 * (unidata-nexrad-level2-chunks) after live testing during implementation
 * showed that bucket's per-site "volume scan number" folders cycle 0-999
 * with no timestamp in the folder name, so finding "the current volume" via
 * S3 prefix listing alone is unreliable (naive numeric-max picked a
 * volume from over a day earlier in testing). AWS's own docs confirm the
 * intended way to consume that bucket in real time is an SNS/SQS
 * subscription (arn:aws:sns:us-east-1:684042711724:NewNEXRADLevel2ObjectFilterable),
 * which needs an AWS account this project doesn't otherwise use — tgftp's
 * flat, chronologically-named files avoid that problem entirely with a
 * plain HTTP directory listing, at the cost of only-getting-data-once-a-
 * volume-fully-completes (roughly 3-5 min latency) rather than the ~30-90s
 * "wait for elevation 1 chunks" latency the S3 approach could have offered.
 *
 * The .bz2 filename extension is misleading: the downloaded bytes are a
 * standard, directly-parseable Archive II file (starts with the "AR2V0006."
 * magic) — bzip2 compression is applied internally per-record exactly as
 * the nexrad-level-2-data library already expects, not as a whole-file
 * wrapper, so no separate decompression step is needed.
 *
 * Split-cut VCPs (e.g. VCP 212) scan reflectivity and velocity at the same
 * tilt angle as two separate "elevation" entries rather than one — verified
 * against a real live KTLX volume during implementation: elevation 1 had
 * reflectivity for all 720 radials and velocity for none, elevation 2 had
 * both. So each product searches a small set of candidate elevations
 * independently and uses the lowest one that actually has data, instead of
 * assuming both live at elevation 1.
 */

import Level2Radar from 'nexrad-level-2-data';
import { encodeScanPayload } from '../src/utils/nexradPayloadFormat.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars');
}

const TGFTP_BASE = 'https://tgftp.nws.noaa.gov/data/radar/nexrad_level2';
const STORAGE_BUCKET = 'nexrad-scans';
const ACTIVE_WINDOW_MS = 15 * 60 * 1000; // sites with no heartbeat in this long are ignored
const CONCURRENCY = 4;
const MIN_RADIALS = 300; // sanity floor: a real base-tilt cut has 360-720 radials
const ELEVATION_CANDIDATES = [1, 2, 3, 4]; // see split-cut note above

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
    // Filenames sort chronologically as strings (YYYYMMDD_HHMMSS is zero-padded),
    // so a plain string max across a site's two product rows is safe.
    const prev = map.get(row.site_id);
    if (row.source_file && (!prev || row.source_file > prev)) map.set(row.site_id, row.source_file);
  }
  return map;
}

/** Latest filename for a site from tgftp's plain-text directory index, or null if unavailable. */
async function findLatestFile(site) {
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

async function downloadFile(site, filename) {
  const resp = await fetch(`${TGFTP_BASE}/${site}/${filename}`);
  if (!resp.ok) throw new Error(`File download failed ${resp.status} for ${site}/${filename}`);
  return new Uint8Array(await resp.arrayBuffer());
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
  const latestFile = await findLatestFile(site);
  if (!latestFile) {
    console.log(`[nexrad-sync] ${site}: no files listed yet`);
    return;
  }
  if (lastPublishedFile != null && latestFile <= lastPublishedFile) {
    console.log(`[nexrad-sync] ${site}: ${latestFile} already published, waiting for next volume`);
    return;
  }

  console.log(`[nexrad-sync] ${site}: downloading ${latestFile}`);
  const bytes = await downloadFile(site, latestFile);

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

  const reflectivity = findBestElevation(radar, () => radar.getHighresReflectivity());
  const velocity = findBestElevation(radar, () => radar.getHighresVelocity());

  const jobs = [];
  if (reflectivity) {
    jobs.push(publishProduct({ site, product: 'reflectivity', scanTimeMs, sourceFile: latestFile, ...reflectivity }));
  }
  if (velocity) {
    jobs.push(publishProduct({ site, product: 'velocity', scanTimeMs, sourceFile: latestFile, ...velocity }));
  }

  if (!jobs.length) {
    console.log(`[nexrad-sync] ${site}: no usable reflectivity/velocity data in ${latestFile}`);
    return;
  }

  await Promise.all(jobs);
  console.log(`[nexrad-sync] ${site}: published ${latestFile}`);
}

const MS_TO_KNOTS = 1.943844;

async function publishProduct({ site, product, elevationDeg, azimuths, radials, scanTimeMs, sourceFile }) {
  const first = radials.find(Boolean);
  const gateCount = first.gate_count;
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
  const unitConvert = product === 'velocity' ? (v) => v * MS_TO_KNOTS : (v) => v;
  const moments = radials.map((r) => (r?.moment_data ?? []).map((v) => (v == null ? v : unitConvert(v))));

  const buffer = encodeScanPayload({
    siteId: site,
    product,
    scanTimeMs,
    elevationDeg,
    azimuths,
    gateCount,
    gateSizeM: first.gate_size,
    firstGateM: first.first_gate,
    moments,
  });

  const storagePath = `${site}/${product}/latest.bin`;

  const uploadResp = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`,
    {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true',
      }),
      body: Buffer.from(buffer),
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
        byte_size: buffer.byteLength,
        gate_count: gateCount,
        radial_count: azimuths.length,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!metaResp.ok) {
    throw new Error(`Scan meta upsert failed for ${site}/${product}: ${metaResp.status} ${await metaResp.text().catch(() => '')}`);
  }
}

main().catch((err) => {
  console.error('[nexrad-sync] fatal:', err);
  process.exit(1);
});
