/**
 * shelters.mjs
 * Shelter candidates for Route to Safety ("Navigation" in the UI): Sentinel's reporter-entered
 * incident_shelters (recent ones only) plus FEMA's National Shelter System
 * Open Shelters feed, merged, cut to the nearest few by straight-line
 * distance, then ranked by drive time with one ORS Matrix request.
 */

import { haversineM, isLngLat } from './geo.mjs';

export const FEMA_OPEN_SHELTERS_URL = 'https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0/query';
export const SENTINEL_MAX_AGE_DAYS = 14;
export const MAX_CANDIDATES = 10;
export const MAX_RESULTS = 5;
const DEDUPE_RADIUS_M = 100;

function radiusBox([lng, lat], radiusKm) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return { minLng: lng - dLng, maxLng: lng + dLng, minLat: lat - dLat, maxLat: lat + dLat };
}

export async function fetchSentinelShelters({ supabase, origin, radiusKm, now = Date.now }) {
  const box = radiusBox(origin, radiusKm);
  const since = new Date(now() - SENTINEL_MAX_AGE_DAYS * 86_400_000).toISOString();
  const q = [
    'incident_shelters?select=id,name,kind,address,lat,lng',
    // People shelters only: never offer an animal shelter as the nearest place to go.
    'kind=in.(evacuation_center,other)',
    `updated_at=gte.${encodeURIComponent(since)}`,
    `lat=gte.${box.minLat}`, `lat=lte.${box.maxLat}`,
    `lng=gte.${box.minLng}`, `lng=lte.${box.maxLng}`,
    'limit=200',
  ].join('&');
  const rows = await supabase.restGet(q);
  return rows
    .filter((r) => isLngLat([r.lng, r.lat]) && typeof r.name === 'string' && r.name.trim())
    .map((r) => ({
      id: `sentinel:${r.id}`,
      source: 'sentinel',
      name: r.name.trim(),
      kind: r.kind || 'evacuation_center',
      address: r.address || null,
      lng: r.lng,
      lat: r.lat,
    }));
}

export async function fetchFemaShelters({ origin, radiusKm, fetchImpl = fetch }) {
  const params = new URLSearchParams({
    where: "upper(shelter_status) = 'OPEN'",
    geometry: `${origin[0]},${origin[1]}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(radiusKm),
    units: 'esriSRUnit_Kilometer',
    outFields: 'shelter_id,shelter_name,address,city,state,zip,latitude,longitude',
    returnGeometry: 'false',
    resultRecordCount: '200',
    f: 'json',
  });
  const res = await fetchImpl(`${FEMA_OPEN_SHELTERS_URL}?${params}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`FEMA shelters ${res.status}`);
  const body = await res.json();
  if (body.error || !Array.isArray(body.features)) throw new Error('FEMA shelters returned an error');
  return body.features
    .map(({ attributes: a }) => a)
    .filter((a) => a && isLngLat([a.longitude, a.latitude]) && typeof a.shelter_name === 'string' && a.shelter_name.trim())
    .map((a) => ({
      id: `fema:${a.shelter_id}`,
      source: 'fema',
      name: a.shelter_name.trim(),
      kind: 'evacuation_center',
      address: [a.address, a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
      lng: a.longitude,
      lat: a.latitude,
    }));
}

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Sentinel rows win over a FEMA row with the same name within ~100 m. */
export function mergeShelters(sentinel, fema) {
  const out = [...sentinel];
  for (const f of fema) {
    const dup = sentinel.some((x) => normName(x.name) === normName(f.name)
      && haversineM([x.lng, x.lat], [f.lng, f.lat]) <= DEDUPE_RADIUS_M);
    if (!dup) out.push(f);
  }
  return out;
}

export function nearestByDistance(origin, shelters, n = MAX_CANDIDATES) {
  return shelters
    .map((x) => ({ x, d: haversineM(origin, [x.lng, x.lat]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(({ x }) => x);
}

/** One ORS Matrix request (origin at index 0). Unreachable candidates are dropped. */
export async function rankByDriveTime(origin, candidates, matrix) {
  const result = await matrix([origin, ...candidates.map((c) => [c.lng, c.lat])]);
  const durations = result?.durations?.[0] ?? [];
  const distances = result?.distances?.[0] ?? [];
  return candidates
    .map((c, i) => ({ ...c, durationSec: durations[i + 1], distanceM: distances[i + 1] }))
    .filter((c) => Number.isFinite(c.durationSec))
    .sort((a, b) => a.durationSec - b.durationSec)
    .slice(0, MAX_RESULTS);
}
