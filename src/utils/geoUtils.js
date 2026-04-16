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
 * Get the centroid [lng, lat] for a GeoJSON Polygon or MultiPolygon geometry.
 * @param {object} geometry GeoJSON geometry
 * @returns {[number, number]|null}
 */
export function polygonCentroid(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') {
    return ringCentroid(geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    // Use the largest sub-polygon (by vertex count) for centroid
    let largest = geometry.coordinates[0];
    for (const poly of geometry.coordinates) {
      if (poly[0].length > largest[0].length) largest = poly;
    }
    return ringCentroid(largest[0]);
  }
  return null;
}
