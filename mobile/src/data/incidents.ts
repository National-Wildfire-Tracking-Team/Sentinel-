/**
 * Live wildfire incidents from Sentinel's AWS fire-perimeters-merge service (cloud/fire-perimeters-merge,
 * served at /fire-perimeters-merge/* on the data-services CloudFront distribution). The service runs
 * the web's WFIGS + FIRIS + IRWIN + CAL FIRE merge once, server-side; this module applies the same
 * client-side steps the live map does on top of it:
 *   - src/app/pages/LiveTrackerPage.jsx                    (request params, stale filters)
 *   - src/app/components/Map/layers/perimeterCentroids.js  (one dot per perimeter fire)
 *   - src/app/hooks/useMergedFireData.js                   (getFireMatchKey)
 */
import { ENV } from '@/config/env';

/** LiveTrackerPage's useMergedFireData(5, …, true). */
const REQUEST_MIN_ACRES = 5;
const INCLUDE_INACTIVE_CAL_FIRE = true;

/** Fires below this size are hidden on the web map (perimeterCentroids.js MIN_FIRE_ACRES). */
export const MIN_FIRE_ACRES = 0.4;

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30000;

export interface Incident {
  /** Unique within one load; the map selects by it. */
  id: string;
  /** UniqueFireIdentifier from the feed (IRWIN id, or CAL FIRE UniqueId). */
  fireId: string;
  /** getFireMatchKey(name) or fireId; links a fire to its perimeter polygons. */
  fireKey: string;
  name: string;
  state: string;
  county: string;
  lat: number;
  lng: number;
  acres: number;
  contained: number | null;
  started: string | null;
  updated: string | null;
  cause: string | null;
  personnel: number;
  managementOrg: string | null;
  /** WFIGS, FIRIS, CAL_FIRE, … ('_source' on the merged feature; WFIGS/IRWIN when absent). */
  source: string;
  detailUrl: string | null;
  aliasIds: string[];
  hasPerimeter: boolean;
  /** The NWTT reporter incident (fire_reports.id) merged into this fire, if any (data/fireReports.ts). */
  reportId?: string;
}

export interface IncidentData {
  incidents: Incident[];
  /** Current (not stale, not historical) perimeters, properties trimmed to what the map needs. */
  perimeters: GeoJSON.FeatureCollection;
}

type Props = Record<string, any>;
type Feature = { type: 'Feature'; geometry: any; properties: Props | null };

export function mergedUrl(): string {
  const params = `minAcres=${REQUEST_MIN_ACRES}&includeInactive=${INCLUDE_INACTIVE_CAL_FIRE}`;
  return `${ENV.dataServicesUrl}/fire-perimeters-merge/merged?${params}`;
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Fire data service HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('Fire data request timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toContained(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isOlderThan(timestamp: unknown, maxAgeMs: number, now: number): boolean {
  if (!timestamp) return false; // missing timestamps are kept, as on the web
  const t = new Date(timestamp as string | number).getTime();
  return Number.isFinite(t) && now - t >= maxAgeMs;
}

/** LiveTrackerPage's isStaleContained: 100% contained and no update in 3+ days. */
function isStaleContained(p: Props, now: number): boolean {
  return Number(p.PercentContained) >= 100 && isOlderThan(p.ModifiedOnDateTime, THREE_DAYS_MS, now);
}

/** Same normalization as the web's getFireMatchKey ("RIDGE FIRE" and "RIDGEFIRE" → "RIDGE"). */
export function getFireMatchKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const upper = name.toUpperCase().trim();
  if (['UNKNOWN', 'UNKNOWN FIRE', 'UNNAMED', ''].includes(upper)) return null;
  let key = upper;
  if (key.includes('/')) key = key.split('/').pop()!.trim();
  key = key
    .replace(/FIRE PERIMETER/g, '')
    .replace(/PERIMETER/g, '')
    .replace(/INCIDENT/g, '')
    .replace(/\bFIRE\b/g, '')
    .replace(/\s+/g, '');
  if (key === 'UNKNOWN' || key === 'UNNAMED') return null;
  return key.length > 0 ? key : null;
}

// ── Geometry (src/app/utils/geoUtils.js) ─────────────────────────────────────

function ringCentroid(ring: number[][]): [number, number] | null {
  const n = ring.length;
  if (n < 3) return null;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = xi * yj - xj * yi;
    area += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-10) return null;
  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor];
}

/** Exterior ring; for a MultiPolygon, the sub-polygon with the most vertices. */
function outerRing(geometry: any): number[][] | null {
  if (geometry?.type === 'Polygon') return geometry.coordinates[0] ?? null;
  if (geometry?.type === 'MultiPolygon') {
    let largest = geometry.coordinates[0];
    for (const poly of geometry.coordinates) {
      if (poly[0].length > largest[0].length) largest = poly;
    }
    return largest?.[0] ?? null;
  }
  return null;
}

function polygonCentroid(geometry: any): [number, number] | null {
  const ring = outerRing(geometry);
  return ring ? ringCentroid(ring) : null;
}

// ── Normalize ────────────────────────────────────────────────────────────────

function splitAliases(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function toIncident(p: Props, [lng, lat]: number[], hasPerimeter: boolean): Omit<Incident, 'id'> {
  const fireId = String(p.UniqueFireIdentifier || '');
  const name = String(p.IncidentName || 'Unknown Fire').trim();
  return {
    fireId,
    fireKey: getFireMatchKey(name) || fireId || name,
    name,
    state: String(p.POOState || '').replace('US-', ''),
    county: String(p.POOCounty || ''),
    lat,
    lng,
    acres: Number(p.GISAcres) || 0,
    contained: toContained(p.PercentContained),
    started: toIso(p.FireDiscoveryDateTime),
    updated: toIso(p.ModifiedOnDateTime),
    cause: p.FireCause || null,
    personnel: Number(p.TotalIncidentPersonnel) || 0,
    managementOrg: p.IncidentManagementOrganization || null,
    source: String(p._source || 'WFIGS'),
    detailUrl: p._detailUrl || null,
    aliasIds: splitAliases(p._aliasIds),
    hasPerimeter,
  };
}

function hasValidLocation(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/**
 * Turns a /merged response into map markers and drawable perimeters, mirroring the web:
 * perimeters drop stale 100%-contained fires and are tagged stale after 30 days; each fire's largest
 * current fragment draws one centroid dot (perimeterCentroids + drawsCentroidDot); incident dots drop
 * stale contained fires and anything not updated in 30 days.
 */
export function processMerged(data: any, now = Date.now()): IncidentData {
  const rawPerimeters: Feature[] = data?.perimeters?.features ?? [];
  const rawDots: Feature[] = data?.dots?.features ?? [];

  const perimeters = rawPerimeters
    .filter(f => f?.geometry && f.properties && !isStaleContained(f.properties, now))
    .map(f => {
      const properties: Props = { ...f.properties };
      properties.isStaleFire = isOlderThan(properties.ModifiedOnDateTime, ONE_MONTH_MS, now);
      return { geometry: f.geometry, properties };
    });

  // perimeterCentroids: active records before historical ones, then largest first; one per fire.
  const candidates = perimeters
    .filter(f => !f.properties.HideFromCentroid)
    .sort((a, b) => {
      const hist = (a.properties.isHistoricalMapping ? 1 : 0) - (b.properties.isHistoricalMapping ? 1 : 0);
      return hist !== 0 ? hist : (Number(b.properties.GISAcres) || 0) - (Number(a.properties.GISAcres) || 0);
    });

  const seen = new Set<string>();
  const markers: Omit<Incident, 'id'>[] = [];
  for (const f of candidates) {
    const p = f.properties;
    const key = getFireMatchKey(p.IncidentName) || p.UniqueFireIdentifier || p.IncidentManagementOrganization;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    // drawsCentroidDot
    if (p.isStaleFire || p.isHistoricalMapping || (Number(p.GISAcres) || 0) < MIN_FIRE_ACRES) continue;
    const center = polygonCentroid(f.geometry);
    if (center && hasValidLocation(center[0], center[1])) markers.push(toIncident(p, center, true));
  }

  for (const f of rawDots) {
    const p = f?.properties;
    const coords = f?.geometry?.coordinates;
    if (!p || !Array.isArray(coords) || !hasValidLocation(coords[0], coords[1])) continue;
    if (isStaleContained(p, now) || isOlderThan(p.ModifiedOnDateTime, ONE_MONTH_MS, now)) continue;
    if ((Number(p.GISAcres) || 0) < MIN_FIRE_ACRES) continue;
    markers.push(toIncident(p, coords, false));
  }

  const usedIds = new Set<string>();
  const incidents: Incident[] = markers
    .sort((a, b) => b.acres - a.acres)
    .map((m, i) => {
      let id = m.fireId || `fire-${i}`;
      if (usedIds.has(id)) id = `${id}#${i}`;
      usedIds.add(id);
      return { ...m, id };
    });

  // Only current perimeters are drawn on mobile; trim properties to keep the native source small.
  const drawn: GeoJSON.Feature[] = perimeters
    .filter(f => !f.properties.isStaleFire && !f.properties.isHistoricalMapping)
    .map(f => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        fireKey: getFireMatchKey(f.properties.IncidentName) || f.properties.UniqueFireIdentifier || '',
        contained: toContained(f.properties.PercentContained) ?? -1,
      },
    }));

  return { incidents, perimeters: { type: 'FeatureCollection', features: drawn } };
}

export async function loadIncidents(): Promise<IncidentData> {
  const data = await fetchJson(mergedUrl());
  if (!Array.isArray(data?.perimeters?.features) || !Array.isArray(data?.dots?.features)) {
    throw new Error('Unexpected fire data response');
  }
  return processMerged(data);
}

/** Point features for the map. `contained` is -1 when unknown so style expressions stay numeric. */
export function incidentsToFeatureCollection(incidents: Incident[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: incidents.map(inc => ({
      type: 'Feature',
      id: inc.id,
      geometry: { type: 'Point', coordinates: [inc.lng, inc.lat] },
      properties: { id: inc.id, name: inc.name, acres: inc.acres, contained: inc.contained ?? -1 },
    })),
  };
}
