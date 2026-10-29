/**
 * usBorder.mjs
 * Point-in-United-States test for the kanari-fires function (and the
 * industrial-sites build script). The outline is Natural Earth's 1:50m
 * admin-0 boundary (public domain), rounded to 3 decimals (~100 m).
 */

import US_OUTLINE from './usOutline.mjs';

function bboxOf(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function inRing([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const US_POLYGONS = US_OUTLINE.coordinates.map((rings) => ({ rings, bbox: bboxOf(rings[0]) }));

/** True when [lon, lat] falls inside the United States (holes respected). */
export function isInUnitedStates(point) {
  const [x, y] = point;
  return US_POLYGONS.some(({ rings, bbox }) =>
    x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3]
    && inRing(point, rings[0])
    && !rings.slice(1).some((hole) => inRing(point, hole)));
}
