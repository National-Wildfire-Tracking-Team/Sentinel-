/**
 * evacExit.js
 * "Nearest Safety Area" when the start is inside an active evacuation zone:
 * find the nearest points just outside every zone, so the route leads out of
 * the zone instead of to a shelter that may be further away.
 *
 * - Any active zone counts (Order, Warning or Watch; official or reporter).
 * - Exits come from rays cast every 10° from the start: the first point along
 *   each ray that is outside every zone (and every fire perimeter), pushed
 *   EXIT_MARGIN_KM further so it clears the 0.5 km avoid buffer in
 *   routingHazards and lands on solid ground outside the zone.
 * - A fire zone (named for a fire, or within FIRE_NEAR_KM of a fire perimeter
 *   or hotspot) only keeps exits that lead away from the nearest fire. If no
 *   exit does, the one furthest from fire is used.
 * - Candidates come back nearest-first, spread across directions, so the caller
 *   can route to a few and keep the quickest drive.
 * - preferMajorRoads then pulls exits onto a nearby motorway/trunk/primary road
 *   and puts those first, as long as the road point is itself a valid exit and
 *   isn't close to a fire. passesFire lets the caller drop a major-road route
 *   that runs past a fire in favour of the next exit.
 */

import bbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

export const RAY_COUNT = 36;
export const STEP_KM = 0.1;
export const MAX_SEARCH_KM = 50;
export const EXIT_MARGIN_KM = 0.6;
export const FIRE_NEAR_KM = 5;
/** An exit must be at least this much further from fire than the start. */
export const AWAY_MIN_GAIN_KM = 0.5;
export const MAX_CANDIDATES = 3;
/** Exits looked up for a nearby major road; the extras widen the choice of roads. */
export const MAX_LOOKUPS = 6;
/** Major-road exits allowed among the routed candidates, leaving room for a plain one. */
export const MAX_MAJOR = 2;
/** A major-road exit point must be at least this far from any fire. */
export const FIRE_CLEAR_KM = 1.5;
/** A route "passes by" a fire when it comes within this distance of one, closer than the start was. */
export const FIRE_PASS_KM = 1;
/** Candidates kept for routing must differ in direction by at least this much. */
const MIN_SPREAD_DEG = 40;
const KM_PER_DEG_LAT = 111.32;
const FIRE_TEXT = /\b(wild)?fires?\b|\bburn|\bblaze\b|\bsmoke\b|\bred flag\b/i;

const isPolygonal = (f) => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');

const kmPerDegLng = (lat) => KM_PER_DEG_LAT * Math.max(0.01, Math.cos((lat * Math.PI) / 180));

/** Equirectangular distance in km; plenty accurate at evacuation-zone scale. */
function distKm(a, b) {
  const dx = (b[0] - a[0]) * kmPerDegLng((a[1] + b[1]) / 2);
  const dy = (b[1] - a[1]) * KM_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Distance in km from a point to the segment a–b (flat projection around the point). */
function segmentKm(pt, a, b) {
  const kx = kmPerDegLng(pt[1]);
  const ax = (a[0] - pt[0]) * kx;
  const ay = (a[1] - pt[1]) * KM_PER_DEG_LAT;
  const bx = (b[0] - pt[0]) * kx;
  const by = (b[1] - pt[1]) * KM_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Initial bearing in degrees (0 = north, clockwise) from a to b. */
function bearingDeg(a, b) {
  const dx = (b[0] - a[0]) * kmPerDegLng((a[1] + b[1]) / 2);
  const dy = (b[1] - a[1]) * KM_PER_DEG_LAT;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

const angleBetween = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

function offset([lng, lat], bearingDeg, km) {
  const rad = (bearingDeg * Math.PI) / 180;
  return [lng + (Math.sin(rad) * km) / kmPerDegLng(lat), lat + (Math.cos(rad) * km) / KM_PER_DEG_LAT];
}

/** Search box around the start: only shapes inside it can matter. */
function searchBounds([lng, lat], km) {
  const dLng = km / kmPerDegLng(lat);
  const dLat = km / KM_PER_DEG_LAT;
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const inBox = (pt, b) => pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3];

function withBox(features, bounds) {
  const out = [];
  for (const f of features) {
    try {
      const box = bbox(f);
      if (overlaps(box, bounds)) out.push({ f, box });
    } catch {
      // Malformed geometry: ignore it rather than fail the route.
    }
  }
  return out;
}

const insideAny = (pt, shapes) => shapes.some(({ f, box }) => inBox(pt, box) && booleanPointInPolygon(pt, f));

/** Vertices of a polygon's outer rings, used to measure distance to a perimeter. */
function outerVertices(f) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.flatMap((p) => p[0] || []);
}

function firePoints(perimeters, hotspots, bounds) {
  const pts = [];
  for (const { f } of perimeters) pts.push(...outerVertices(f));
  for (const f of hotspots?.features || []) {
    const c = f?.geometry?.type === 'Point' ? f.geometry.coordinates : null;
    if (c && Number.isFinite(c[0]) && Number.isFinite(c[1]) && inBox(c, bounds)) pts.push(c);
  }
  return pts;
}

function nearestFire(pt, fires) {
  let best = { km: Infinity, at: null };
  for (const f of fires) {
    const km = distKm(pt, f);
    if (km < best.km) best = { km, at: f };
  }
  return best;
}

/** Distance in km from a point to the nearest edge of a polygon's outer rings. */
function edgeKm(pt, f) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best = Infinity;
  for (const ring of polys.map((p) => p[0] || [])) {
    for (let i = 1; i < ring.length; i += 1) best = Math.min(best, segmentKm(pt, ring[i - 1], ring[i]));
  }
  return best;
}

function zoneText(p = {}) {
  return [p.zoneName, p.ipawsEvent, p.ipawsHeadline, p.ipawsDescription, p.title, p.description, p.incident_name, p.comments]
    .filter(Boolean)
    .join(' ');
}

export function zoneLevel(p = {}) {
  return p.warningType || p.zone_type || 'Evacuation Zone';
}

/**
 * True when the zone names a fire, or a fire (perimeter vertex or hotspot) sits
 * in or within FIRE_NEAR_KM of it, or the zone lies inside a perimeter.
 */
export function isFireZone(zone, perimeters, fires) {
  if (FIRE_TEXT.test(zoneText(zone.properties))) return true;
  const box = bbox(zone);
  const midLat = (box[1] + box[3]) / 2;
  const dLng = FIRE_NEAR_KM / kmPerDegLng(midLat);
  const dLat = FIRE_NEAR_KM / KM_PER_DEG_LAT;
  const grown = [box[0] - dLng, box[1] - dLat, box[2] + dLng, box[3] + dLat];
  const verts = outerVertices(zone);
  if (verts.length && insideAny(verts[0], perimeters)) return true;
  return fires.some((pt) => inBox(pt, grown) && (booleanPointInPolygon(pt, zone) || edgeKm(pt, zone) <= FIRE_NEAR_KM));
}

/** Keep the nearest candidates, skipping ones that point the same way as one already kept. */
function spread(candidates, max) {
  const kept = [];
  for (const c of candidates) {
    if (kept.length >= max) break;
    const tooClose = kept.some((k) => angleBetween(k.bearing, c.bearing) < MIN_SPREAD_DEG);
    if (!tooClose) kept.push(c);
  }
  return kept;
}

/**
 * @returns {null | {
 *   origin, zone: { name, level, isFire },
 *   candidates: Array<{ point: [lng, lat], distanceKm, bearing }>,  nearest MAX_CANDIDATES
 *   pool: same shape, up to MAX_LOOKUPS, for preferMajorRoads
 *   accepts(point): boolean, whether another point would also be a valid exit
 *   passesFire(coords): boolean, whether a route line runs past a fire
 * }}
 *   null when the start is not inside any active evacuation zone, or no way out
 *   was found within MAX_SEARCH_KM.
 */
export function findEvacExit({ origin, evacZones, perimeters, hotspots }) {
  const bounds = searchBounds(origin, MAX_SEARCH_KM + EXIT_MARGIN_KM);
  const zones = withBox((evacZones?.features || []).filter(isPolygonal), bounds);
  const containing = zones.filter(({ f, box }) => inBox(origin, box) && booleanPointInPolygon(origin, f));
  if (!containing.length) return null;

  const fireShapes = withBox((perimeters?.features || []).filter(isPolygonal), bounds);
  const fires = firePoints(fireShapes, hotspots, bounds);
  const fireZone = containing.find(({ f }) => isFireZone(f, fireShapes, fires));
  // Name the zone the user is in; prefer the fire one, then the most severe.
  const rank = (z) => (/order/i.test(zoneLevel(z.f.properties)) ? 0 : /warning/i.test(zoneLevel(z.f.properties)) ? 1 : 2);
  const named = fireZone || [...containing].sort((a, b) => rank(a) - rank(b))[0];
  const p = named.f.properties || {};
  const zone = { name: p.zoneName || p.title || null, level: zoneLevel(p), isFire: Boolean(fireZone) };

  const blocked = [...zones, ...fireShapes];
  const found = [];
  for (let i = 0; i < RAY_COUNT; i += 1) {
    const bearing = (360 / RAY_COUNT) * i;
    for (let km = STEP_KM; km <= MAX_SEARCH_KM; km += STEP_KM) {
      if (insideAny(offset(origin, bearing, km), blocked)) continue;
      // Narrow the edge down to ~1 m so nearby rays rank by true distance.
      let lo = km - STEP_KM;
      let hi = km;
      for (let j = 0; j < 7; j += 1) {
        const mid = (lo + hi) / 2;
        if (insideAny(offset(origin, bearing, mid), blocked)) lo = mid;
        else hi = mid;
      }
      const point = offset(origin, bearing, hi + EXIT_MARGIN_KM);
      // The margin can land in a neighbouring zone; keep walking if so.
      if (insideAny(point, blocked)) continue;
      found.push({ point, distanceKm: hi + EXIT_MARGIN_KM, bearing });
      break;
    }
  }
  if (!found.length) return null;

  // Away = not heading toward the nearest fire (≥ 90° off its bearing) and
  // ending further from fire than the start. The bearing check stops an exit
  // that runs straight past the fire from counting just because it ends beyond it.
  const start = fires.length ? nearestFire(origin, fires) : null;
  const fireBearing = start ? bearingDeg(origin, start.at) : null;
  const isAway = (bearing, fireKm) => angleBetween(bearing, fireBearing) >= 90 && fireKm >= start.km + AWAY_MIN_GAIN_KM;

  let pool = found;
  if (zone.isFire && start) {
    const scored = found.map((c) => ({ ...c, fireKm: nearestFire(c.point, fires).km }));
    const away = scored.filter((c) => isAway(c.bearing, c.fireKm));
    pool = away.length ? away : [scored.reduce((a, b) => (b.fireKm > a.fireKm ? b : a))];
  }
  pool.sort((a, b) => a.distanceKm - b.distanceKm);
  const tidy = ({ point, distanceKm, bearing }) => ({ point: point.map(round5), distanceKm, bearing });

  const accepts = (point) => {
    if (insideAny(point, blocked)) return false;
    if (!start) return true;
    const fireKm = nearestFire(point, fires).km;
    if (fireKm < FIRE_CLEAR_KM) return false;
    return !zone.isFire || isAway(bearingDeg(origin, point), fireKm);
  };
  const passesFire = (coords) => {
    if (!start || !Array.isArray(coords)) return false;
    return coords.some((c) => {
      const km = nearestFire(c, fires).km;
      return km <= FIRE_PASS_KM && km < start.km;
    }) || coords.some((c) => insideAny(c, fireShapes));
  };

  return {
    origin,
    zone,
    candidates: spread(pool, MAX_CANDIDATES).map(tidy),
    pool: spread(pool, MAX_LOOKUPS).map(tidy),
    accepts,
    passesFire,
  };
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

/**
 * Re-ranks an exit's candidates so major roads come first: each pooled exit is
 * looked up for a nearby major road (`lookup(point)` → { point, name } | null),
 * and a road point that is itself a valid exit (exit.accepts) is used instead.
 * Up to MAX_MAJOR road exits (nearest first), then the plain exits, MAX_CANDIDATES
 * in all. A failed lookup just leaves that exit as it was.
 */
export async function preferMajorRoads(exit, lookup) {
  const hits = await Promise.all(exit.pool.map((c) => Promise.resolve().then(() => lookup(c.point)).catch(() => null)));
  const major = [];
  for (const hit of hits) {
    if (!hit?.point || !exit.accepts(hit.point)) continue;
    const point = hit.point.map(round5);
    if (major.some((m) => distKm(m.point, point) < 0.3)) continue;
    major.push({ point, distanceKm: distKm(exit.origin, point), bearing: bearingDeg(exit.origin, point), major: true, road: hit.name ?? null });
  }
  major.sort((a, b) => a.distanceKm - b.distanceKm);
  const picked = major.slice(0, MAX_MAJOR);
  const plain = exit.candidates.filter((c) => !picked.some((m) => distKm(m.point, c.point) < 0.3));
  return [...picked, ...plain].slice(0, MAX_CANDIDATES);
}
