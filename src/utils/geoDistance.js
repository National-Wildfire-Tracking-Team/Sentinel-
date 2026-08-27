/**
 * geoDistance.js
 * Shared great-circle distance helper.
 */

const EARTH_RADIUS_MI = 3958.8;

/**
 * Haversine great-circle distance between two [lng, lat] points, in miles.
 */
export function haversineMiles([lng1, lat1], [lng2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}
