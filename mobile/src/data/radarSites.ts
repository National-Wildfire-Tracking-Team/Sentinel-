/**
 * Individual Radar Site (the web's RadarSiteContext, api/nexradLevel3.js and utils/radarSweep.js):
 * NEXRAD and TDWR stations, which ones NWS reports down, and the selected station's newest Level 3
 * scan from the public Unidata bucket on AWS.
 * The sweep itself is drawn by map/radarSweepImage.ts.
 */
import { parseLevel3, type Level3Scan } from '@/lib/nexrad/nexradLevel3';
import RADAR_SITES_JSON from './radarSites.json';

export interface RadarSite {
  id: string;
  type: 'wsr88d' | 'tdwr';
  lat: number;
  lon: number;
  place: string;
  state: string;
}

export const RADAR_SITES = RADAR_SITES_JSON as RadarSite[];

export type RadarKind = 'reflectivity' | 'velocity' | 'cc' | 'zdr';

export const RADAR_KINDS: { id: RadarKind; label: string }[] = [
  { id: 'reflectivity', label: 'Radar' },
  { id: 'velocity', label: 'Velocity' },
  { id: 'cc', label: 'Correlation Coefficient' },
  { id: 'zdr', label: 'Differential Reflectivity' },
];

const SITE_PRODUCTS: Record<RadarSite['type'], Partial<Record<RadarKind, { code: string; label: string }>>> = {
  wsr88d: {
    reflectivity: { code: 'N0B', label: 'Base Reflectivity' },
    velocity: { code: 'N0G', label: 'Base Velocity' },
    cc: { code: 'N0C', label: 'Correlation Coefficient' },
    zdr: { code: 'N0X', label: 'Differential Reflectivity' },
  },
  // TDWRs aren't dual-polarization: no CC or ZDR.
  tdwr: {
    reflectivity: { code: 'TZ0', label: 'TDWR Reflectivity' },
    velocity: { code: 'TV0', label: 'TDWR Velocity' },
  },
};

export function siteProduct(site: RadarSite | null, kind: RadarKind) {
  return site ? (SITE_PRODUCTS[site.type][kind] ?? null) : null;
}

// ── Station status ───────────────────────────────────────────────────────────────────────────────

const LEVEL2_SILENT_MS = 30 * 60_000;

/** Stations NWS reports down: radar inoperable or not operating, or a WSR-88D silent for 30 min. */
export async function fetchDownStations(now = Date.now()): Promise<Set<string>> {
  const res = await fetch('https://api.weather.gov/radar/stations?stationType=WSR-88D,TDWR', {
    headers: { Accept: 'application/geo+json', 'User-Agent': 'SentinelWildfireTracker/1.0 (nationalwildfiretrackingteam.org)' },
  });
  if (!res.ok) throw new Error(`Radar station status HTTP ${res.status}`);
  const body = await res.json();
  const down = new Set<string>();
  for (const f of body?.features ?? []) {
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

// ── Scans ────────────────────────────────────────────────────────────────────────────────────────

const BUCKET = 'https://unidata-nexrad-level3.s3.amazonaws.com';
const HOURS_BACK = 3;
const pad = (n: number) => String(n).padStart(2, '0');

/** Newest scan key for a site and product, searching the current UTC hour and up to 3 before it. */
export async function latestScanKey(site: RadarSite, kind: RadarKind, now = Date.now()): Promise<string | null> {
  const product = siteProduct(site, kind)?.code;
  if (!product) throw new Error(`Unsupported radar product ${site.type} ${kind}`);
  for (let h = 0; h <= HOURS_BACK; h++) {
    const d = new Date(now - h * 3600_000);
    const prefix = `${site.id.slice(1)}_${product}_${d.getUTCFullYear()}_${pad(d.getUTCMonth() + 1)}_${pad(d.getUTCDate())}_${pad(d.getUTCHours())}_`;
    const res = await fetch(`${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}`);
    if (!res.ok) throw new Error(`Radar archive HTTP ${res.status}`);
    const keys = [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]).sort();
    if (keys.length) return keys[keys.length - 1];
  }
  return null;
}

export async function fetchScan(key: string): Promise<Level3Scan> {
  const res = await fetch(`${BUCKET}/${encodeURI(key)}`);
  if (!res.ok) throw new Error(`Radar scan HTTP ${res.status}`);
  return parseLevel3(new Uint8Array(await res.arrayBuffer()));
}

// ── Colour scales (utils/radarSweep.js) ──────────────────────────────────────────────────────────

type Stops = [number, string][];

/** NWS base reflectivity: each colour holds until the next step. */
export const REFLECTIVITY_SCALE: Stops = [
  [5, '#04e9e7'], [10, '#019ff4'], [15, '#0300f4'], [20, '#02fd02'], [25, '#01c501'], [30, '#008e00'], [35, '#fdf802'],
  [40, '#e5bc00'], [45, '#fd9500'], [50, '#fd0000'], [55, '#d40000'], [60, '#bc0000'], [65, '#f800fd'], [70, '#9854c6'],
  [75, '#fdfdfd'],
];
/** Base velocity, m/s (negative = toward the radar). Blended between stops. */
export const VELOCITY_SCALE: Stops = [
  [-40, '#b4ffb4'], [-30, '#00ff00'], [-18, '#00bb00'], [-8, '#006e00'], [-1, '#3c4d3c'], [1, '#4d3c3c'], [8, '#6e0000'],
  [18, '#bb0000'], [30, '#ff0000'], [40, '#ffb4b4'],
];
export const CC_SCALE: Stops = [
  [0.2, '#0c0c4a'], [0.45, '#1e2ad2'], [0.65, '#2f9ed6'], [0.75, '#2bc46a'], [0.85, '#c8d200'], [0.9, '#ffa000'],
  [0.95, '#ff2a00'], [0.98, '#b40000'], [1.0, '#ff8cf0'], [1.05, '#ffffff'],
];
export const ZDR_SCALE: Stops = [
  [-4, '#303030'], [-1, '#8c8c8c'], [0, '#d2d2d2'], [0.5, '#2828a8'], [1, '#3c8cff'], [1.5, '#00c8c8'], [2, '#00c000'],
  [2.5, '#f0f000'], [3, '#ff9600'], [4, '#ff0000'], [5, '#b40050'], [6, '#ff9cff'], [8, '#ffffff'],
];

/** "Reflectivity Gates" L/H handles: 0 … 70 (70 reads "70+"), snapping to tens within 2. */
export const DBZ_MAX = 70;
export function snapDbz(value: number): number {
  const v = Math.min(DBZ_MAX, Math.max(0, Math.round(Number(value) || 0)));
  const ten = Math.round(v / 10) * 10;
  return Math.abs(v - ten) <= 2 ? ten : v;
}
