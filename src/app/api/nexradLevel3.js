/**
 * nexradLevel3.js
 * Live NEXRAD Level 3 scans for the Radar Site layer, read straight from
 * the public Unidata/NOAA Open Data bucket on AWS that supercell-wx uses
 * (unidata-nexrad-level3, us-east-1). Public, no key, open CORS.
 *
 *   Keys: {SSS}_{PRODUCT}_{YYYY}_{MM}_{DD}_{HH}_{MM}_{SS}
 *     SSS: the 4-letter site ID without its first letter (KTLX → TLX, TDAL → DAL)
 *     PRODUCT: see SITE_PRODUCTS (e.g. N0B WSR-88D super-res base reflectivity, TZ0 TDWR reflectivity)
 *
 * Only the selected station is ever listed or downloaded (~350 KB per scan).
 *
 * Which stations are down comes from the NWS radar station status feed
 * (api.weather.gov/radar/stations): one request for every station.
 */

const BUCKET = 'https://unidata-nexrad-level3.s3.amazonaws.com';
const HOURS_BACK = 3; // how far back to look for a station's latest scan

/** What the Radar Site drawer can show, in its order. */
export const RADAR_KINDS = [
  { id: 'reflectivity', label: 'Radar' },
  { id: 'velocity', label: 'Velocity' },
  { id: 'cc', label: 'Correlation Coefficient' },
  { id: 'zdr', label: 'Differential Reflectivity' },
];

/** Level 3 product per radar type and kind. TDWRs aren't dual-polarization: no CC or ZDR. */
export const SITE_PRODUCTS = {
  wsr88d: {
    reflectivity: { code: 'N0B', label: 'Base Reflectivity' },
    velocity: { code: 'N0G', label: 'Base Velocity' },
    cc: { code: 'N0C', label: 'Correlation Coefficient' },
    zdr: { code: 'N0X', label: 'Differential Reflectivity' },
  },
  tdwr: {
    reflectivity: { code: 'TZ0', label: 'TDWR Reflectivity' },
    velocity: { code: 'TV0', label: 'TDWR Velocity' },
  },
};

/** The product a site shows for a kind, or null if that radar doesn't measure it. */
export function siteProduct(site, kind = 'reflectivity') {
  return SITE_PRODUCTS[site?.type]?.[kind] ?? null;
}

const NWS_RADAR_STATIONS = 'https://api.weather.gov/radar/stations?stationType=WSR-88D,TDWR';
const NWS_HEADERS = { Accept: 'application/geo+json' };
const LEVEL2_SILENT_MS = 30 * 60 * 1000;

/**
 * Station IDs NWS reports as down: the radar (RDA) is inoperable or not in
 * "Operate", or a WSR-88D has sent no Level 2 data for 30 minutes. TDWRs
 * don't send Level 2, so for them only the RDA status counts. Stations with
 * no status at all aren't called down.
 * @param {object} collection  api.weather.gov /radar/stations GeoJSON
 * @returns {Set<string>}
 */
export function downStations(collection, now = Date.now()) {
  const down = new Set();
  for (const f of collection?.features ?? []) {
    const p = f.properties ?? {};
    const rda = p.rda?.properties;
    if (!p.id || !rda) continue;
    const inoperable = /inoperable/i.test(rda.operabilityStatus ?? '') || (rda.status && rda.status !== 'Operate');
    const last = Date.parse(p.latency?.levelTwoLastReceivedTime ?? '');
    const silent = p.stationType === 'WSR-88D' && (!Number.isFinite(last) || now - last > LEVEL2_SILENT_MS);
    if (inoperable || silent) down.add(p.id);
  }
  return down;
}

/** @returns {Promise<Set<string>>} IDs of stations that are down right now */
export async function fetchDownStations({ signal } = {}) {
  const res = await fetch(NWS_RADAR_STATIONS, { headers: NWS_HEADERS, signal });
  if (!res.ok) throw new Error(`Radar station status HTTP ${res.status}`);
  return downStations(await res.json());
}

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
export async function latestScanKey(site, { kind = 'reflectivity', signal, now = Date.now() } = {}) {
  const product = siteProduct(site, kind)?.code;
  if (!product) throw new Error(`Unsupported radar product ${site.type} ${kind}`);
  for (let h = 0; h <= HOURS_BACK; h++) {
    const keys = await listKeys(hourPrefix(site, product, new Date(now - h * 3600000)), signal);
    if (keys.length) return keys.sort()[keys.length - 1];
  }
  return null;
}

/** Download one scan's raw bytes (decode with utils/radarSiteRender.js). */
export async function fetchScan(key, { signal } = {}) {
  const res = await fetch(`${BUCKET}/${encodeURI(key)}`, { signal });
  if (!res.ok) throw new Error(`Radar scan HTTP ${res.status}`);
  return res.arrayBuffer();
}
