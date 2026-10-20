/**
 * geo.mjs
 * Coordinate helpers. Coordinates are GeoJSON order: [lng, lat].
 */

export function isLngLat(p) {
  return Array.isArray(p)
    && p.length === 2
    && typeof p[0] === 'number' && typeof p[1] === 'number'
    && Number.isFinite(p[0]) && Number.isFinite(p[1])
    && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM([lng1, lat1], [lng2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function roundCoord(n, dp) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
