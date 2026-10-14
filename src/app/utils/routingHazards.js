/**
 * routingHazards.js
 * Turns the hazard polygons already loaded on the All Hazards map (fire
 * perimeters + evacuation orders/warnings) into ORS `avoid_polygons`.
 *
 * - Only hazards near the trip (its bbox + 20 km) are sent.
 * - Each is buffered 0.5 km so routes don't skim the edge.
 * - A polygon containing the start or end is dropped (ORS can't route out
 *   of an avoided area); the caller shows a warning instead.
 * - Pieces are clipped to 12 km cells: the public ORS API rejects avoid
 *   polygons over ~20 km extent / 200 km² area, which large fires exceed.
 * - Coordinates are rounded to 5 decimals (~1 m); Turf's full-precision
 *   floats cost ~39 B per vertex and blew past the server's body cap.
 * - Vertex count is capped by progressive simplification, then by keeping
 *   the pieces closest to the trip. The polygon count is capped the same way,
 *   and finally the serialized request size (MAX_AVOID_BYTES).
 */

import bbox from '@turf/bbox';
import bboxClip from '@turf/bbox-clip';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import buffer from '@turf/buffer';
import simplify from '@turf/simplify';

export const BUFFER_KM = 0.5;
export const MARGIN_KM = 20;
export const CELL_KM = 12;
export const MAX_VERTICES = 10000;
export const MAX_POLYGONS = 2000;
/** Cap on JSON.stringify({ origin, destination, avoid }); the server accepts 512 KB. */
export const MAX_AVOID_BYTES = 150_000;
const COORD_DECIMALS = 5;
const TOLERANCES = [0.0002, 0.0005, 0.001, 0.002, 0.005];
const KM_PER_DEG_LAT = 111.32;

export function isAvoidedEvacZone(feature) {
  const p = feature?.properties || {};
  const level = String(p.warningType ?? p.zone_type ?? '').toLowerCase();
  return /order|warning/.test(level);
}

const isPolygonal = (f) => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');

function polygonsOf(feature) {
  const g = feature.geometry;
  const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return list.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }));
}

function tripBounds(origin, destination) {
  const midLat = (origin[1] + destination[1]) / 2;
  const dLat = MARGIN_KM / KM_PER_DEG_LAT;
  const dLng = MARGIN_KM / (KM_PER_DEG_LAT * Math.max(0.01, Math.cos((midLat * Math.PI) / 180)));
  return [
    Math.min(origin[0], destination[0]) - dLng,
    Math.min(origin[1], destination[1]) - dLat,
    Math.max(origin[0], destination[0]) + dLng,
    Math.max(origin[1], destination[1]) + dLat,
  ];
}

const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

function clipToCells(poly, bounds) {
  const [pMinX, pMinY, pMaxX, pMaxY] = bbox(poly);
  const midLat = (pMinY + pMaxY) / 2;
  const stepY = CELL_KM / KM_PER_DEG_LAT;
  const stepX = CELL_KM / (KM_PER_DEG_LAT * Math.max(0.01, Math.cos((midLat * Math.PI) / 180)));
  if (pMaxX - pMinX <= stepX && pMaxY - pMinY <= stepY) return [poly];
  // Only tile the part of the polygon near the trip.
  const minX = Math.max(pMinX, bounds[0]);
  const minY = Math.max(pMinY, bounds[1]);
  const maxX = Math.min(pMaxX, bounds[2]);
  const maxY = Math.min(pMaxY, bounds[3]);
  if (minX > maxX || minY > maxY) return [];
  const pieces = [];
  for (let x = minX; x < maxX; x += stepX) {
    for (let y = minY; y < maxY; y += stepY) {
      const clipped = bboxClip(poly, [x, y, Math.min(x + stepX, maxX), Math.min(y + stepY, maxY)]);
      for (const p of polygonsOf(clipped)) {
        if (p.geometry.coordinates[0]?.length >= 4) pieces.push(p);
      }
    }
  }
  return pieces;
}

const round = (n) => Math.round(n * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS;

/** Rounds a ring, drops consecutive repeats, keeps it closed; null if it collapses below 4 points. */
function roundRing(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const pt = [round(x), round(y)];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) out.push(pt);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([...out[0]]);
  return out.length >= 4 ? out : null;
}

/** Rounds every ring; a polygon whose outer ring collapses is dropped, a collapsed hole just goes. */
function roundPolygon(p) {
  const [outer, ...holes] = p.geometry.coordinates;
  const shell = outer && roundRing(outer);
  if (!shell) return null;
  const coordinates = [shell, ...holes.map(roundRing).filter(Boolean)];
  return { ...p, geometry: { type: 'Polygon', coordinates } };
}

/** Pieces ordered nearest-first by bbox centre distance to the trip midpoint. */
function byTripProximity(polys, origin, destination) {
  const mid = [(origin[0] + destination[0]) / 2, (origin[1] + destination[1]) / 2];
  return polys
    .map((p) => {
      const [a, b, c, d] = bbox(p);
      return { p, d: Math.hypot((a + c) / 2 - mid[0], (b + d) / 2 - mid[1]) };
    })
    .sort((x, y) => x.d - y.d)
    .map(({ p }) => p);
}

const vertexCount = (polys) => polys.reduce((n, p) => n + p.geometry.coordinates.reduce((m, r) => m + r.length, 0), 0);

export function buildAvoidPolygons({ perimeters, evacZones, origin, destination }) {
  const bounds = tripBounds(origin, destination);
  const sources = [
    ...(perimeters?.features || []).filter(isPolygonal),
    ...(evacZones?.features || []).filter((f) => isPolygonal(f) && isAvoidedEvacZone(f)),
  ];

  let startsInsideHazard = false;
  let endsInsideHazard = false;
  let polys = [];
  for (const f of sources) {
    for (const p of polygonsOf(f)) {
      if (!overlaps(bbox(p), bounds)) continue;
      try {
        const buffered = buffer(p, BUFFER_KM, { units: 'kilometers' });
        if (!buffered) continue;
        for (const b of polygonsOf(buffered)) {
          const hasStart = booleanPointInPolygon(origin, b);
          const hasEnd = booleanPointInPolygon(destination, b);
          startsInsideHazard ||= hasStart;
          endsInsideHazard ||= hasEnd;
          if (!hasStart && !hasEnd) polys.push(...clipToCells(b, bounds));
        }
      } catch {
        // Invalid/self-intersecting perimeter: skip it rather than fail the route.
      }
    }
  }
  // Simplification only drops points, so rounding once here holds for the output.
  polys = polys.map(roundPolygon).filter(Boolean);
  if (!polys.length) return { avoid: null, startsInsideHazard, endsInsideHazard };

  for (const tolerance of TOLERANCES) {
    if (vertexCount(polys) <= MAX_VERTICES) break;
    polys = polys.map((p) => simplify(p, { tolerance, highQuality: false }));
  }
  if (vertexCount(polys) > MAX_VERTICES || polys.length > MAX_POLYGONS) {
    const kept = [];
    let n = 0;
    for (const p of byTripProximity(polys, origin, destination)) {
      if (kept.length >= MAX_POLYGONS) break;
      const v = vertexCount([p]);
      if (n + v > MAX_VERTICES) continue;
      kept.push(p);
      n += v;
    }
    polys = kept;
  }

  // Serialized-size cap on the whole request body, nearest pieces first.
  // JSON of the array is "[" + pieces.join(",") + "]", so the size adds up exactly.
  const bodyBytes = (coordinates) => JSON.stringify({ origin, destination, avoid: { type: 'MultiPolygon', coordinates } }).length;
  if (bodyBytes(polys.map((p) => p.geometry.coordinates)) >= MAX_AVOID_BYTES) {
    const kept = [];
    let size = bodyBytes([]);
    for (const p of byTripProximity(polys, origin, destination)) {
      const add = JSON.stringify(p.geometry.coordinates).length + (kept.length ? 1 : 0);
      if (size + add >= MAX_AVOID_BYTES) continue;
      kept.push(p);
      size += add;
    }
    polys = kept;
  }
  if (!polys.length) return { avoid: null, startsInsideHazard, endsInsideHazard };

  return {
    avoid: { type: 'MultiPolygon', coordinates: polys.map((p) => p.geometry.coordinates) },
    startsInsideHazard,
    endsInsideHazard,
  };
}
