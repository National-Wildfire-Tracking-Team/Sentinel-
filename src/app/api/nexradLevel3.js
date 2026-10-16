/**
 * nexradLevel3.js
 * Live NEXRAD Level 3 scans for the Radar Site layer, read straight from
 * the public Unidata/NOAA Open Data bucket on AWS that supercell-wx uses
 * (unidata-nexrad-level3, us-east-1). Public, no key, open CORS.
 *
 *   Keys: {SSS}_{PRODUCT}_{YYYY}_{MM}_{DD}_{HH}_{MM}_{SS}
 *     SSS: the 4-letter site ID without its first letter (KTLX → TLX, TDAL → DAL)
 *     PRODUCT: N0B (WSR-88D super-res base reflectivity) or TZ0 (TDWR reflectivity)
 *
 * Only the selected station is ever listed or downloaded (~350 KB per scan).
 */

const BUCKET = 'https://unidata-nexrad-level3.s3.amazonaws.com';
const HOURS_BACK = 3; // how far back to look for a station's latest scan

/** Level 3 product shown for each radar type */
export const SITE_PRODUCT = {
  wsr88d: { code: 'N0B', label: 'Base Reflectivity' },
  tdwr: { code: 'TZ0', label: 'TDWR Reflectivity' },
};

const pad = (n) => String(n).padStart(2, '0');

/** Key prefix for one site/product/UTC hour */
function hourPrefix(site, product, date) {
  const d = date;
  return `${site.id.slice(1)}_${product}_${d.getUTCFullYear()}_${pad(d.getUTCMonth() + 1)}_${pad(d.getUTCDate())}_${pad(d.getUTCHours())}_`;
}

/** Scan time encoded in a key's suffix */
export function keyTime(key) {
  const m = /_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/.exec(key);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

async function listKeys(prefix, signal) {
  const res = await fetch(`${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}`, { signal });
  if (!res.ok) throw new Error(`Radar archive HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}

/**
 * Newest scan key for a site, searching the current UTC hour and then
 * earlier ones. Keys sort chronologically, so the last one wins.
 * @returns {Promise<string|null>}
 */
export async function latestScanKey(site, { signal, now = Date.now() } = {}) {
  const product = SITE_PRODUCT[site.type]?.code;
  if (!product) throw new Error(`Unsupported radar type ${site.type}`);
  for (let h = 0; h <= HOURS_BACK; h++) {
    const keys = await listKeys(hourPrefix(site, product, new Date(now - h * 3600000)), signal);
    if (keys.length) return keys.sort()[keys.length - 1];
  }
  return null;
}

/** Download one scan's raw bytes (decode with utils/radarSiteRender.js). */
export async function fetchScan(key, { signal } = {}) {
  const res = await fetch(`${BUCKET}/${key}`, { signal });
  if (!res.ok) throw new Error(`Radar scan HTTP ${res.status}`);
  return res.arrayBuffer();
}
