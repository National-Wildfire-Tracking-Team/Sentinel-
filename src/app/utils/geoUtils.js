/**
 * geoUtils.js
 * Shared geographic utility functions for polygon centroid computation.
 */

/**
 * Compute the centroid of a polygon ring (array of [lng, lat] pairs).
 * Uses the signed-area weighted centroid formula for accuracy.
 * @param {number[][]} ring
 * @returns {[number, number]|null} [lng, lat] or null
 */
export function ringCentroid(ring) {
  const n = ring.length;
  if (n < 3) return null;

  let area = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
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

/**
 * Get the exterior ring (array of [lng, lat] pairs) of a GeoJSON Polygon or
 * MultiPolygon geometry. For MultiPolygon, uses the largest sub-polygon
 * (by vertex count), matching polygonCentroid()'s choice of sub-polygon.
 * @param {object} geometry GeoJSON geometry
 * @returns {number[][]|null}
 */
export function outerRing(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0] ?? null;
  }
  if (geometry.type === 'MultiPolygon') {
    let largest = geometry.coordinates[0];
    for (const poly of geometry.coordinates) {
      if (poly[0].length > largest[0].length) largest = poly;
    }
    return largest?.[0] ?? null;
  }
  return null;
}

/**
 * Get the centroid [lng, lat] for a GeoJSON Polygon or MultiPolygon geometry.
 * @param {object} geometry GeoJSON geometry
 * @returns {[number, number]|null}
 */
export function polygonCentroid(geometry) {
  const ring = outerRing(geometry);
  return ring ? ringCentroid(ring) : null;
}

/**
 * [west, south, east, north] covering every coordinate in the given
 * FeatureCollections, or null when they hold no geometry. Naive min/max, so
 * a set straddling the antimeridian comes back world-wide.
 */
export function featureCollectionsBounds(...collections) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (coords) => {
    if (typeof coords?.[0] === 'number') {
      const [lng, lat] = coords;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        west = Math.min(west, lng);
        east = Math.max(east, lng);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
      return;
    }
    if (Array.isArray(coords)) coords.forEach(visit);
  };
  for (const fc of collections) {
    for (const f of fc?.features ?? []) visit(f?.geometry?.coordinates);
  }
  return Number.isFinite(west) ? [west, south, east, north] : null;
}
