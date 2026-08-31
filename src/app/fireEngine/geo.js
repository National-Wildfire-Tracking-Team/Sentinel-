/**
 * geo.js
 * Minimal spherical-earth geometry helpers for the fire engine — bearing,
 * destination point, and ring resampling. Deliberately self-contained (no
 * turf.js dependency) to match this codebase's existing pattern of small,
 * dependency-free geo utilities (see src/utils/geoUtils.js and the private
 * helpers in src/utils/fireBehaviorModel.js).
 */

const EARTH_RADIUS_MI = 3958.8;

/** Compass bearing (deg, 0=N clockwise) from one [lng,lat] point to another. */
export function bearingDegrees([lng1, lat1], [lng2, lat2]) {
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const dLngRad = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLngRad) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLngRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Offset a [lng,lat] point by a compass bearing (deg, 0=N clockwise) and distance (miles). */
export function destinationPoint([lng, lat], bearingDeg, distanceMi) {
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angularDist = distanceMi / EARTH_RADIUS_MI;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDist) +
    Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearing)
  );
  const newLngRad = lngRad + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDist) * Math.cos(latRad),
    Math.cos(angularDist) - Math.sin(latRad) * Math.sin(newLatRad)
  );

  return [((newLngRad * 180) / Math.PI + 540) % 360 - 180, (newLatRad * 180) / Math.PI];
}

/** Great-circle distance in miles between two [lng,lat] points. */
export function distanceMiles([lng1, lat1], [lng2, lat2]) {
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const dLatRad = ((lat2 - lat1) * Math.PI) / 180;
  const dLngRad = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLatRad / 2) ** 2 + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLngRad / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}

/** Evenly downsample a closed ring to at most maxPoints, preserving overall shape. */
export function resampleRing(ring, maxPoints) {
  if (ring.length <= maxPoints) return ring;
  const step = ring.length / maxPoints;
  const sampled = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(ring[Math.floor(i * step)]);
  }
  return sampled;
}

/** Ensure a ring is closed (first point === last point). */
export function closeRing(ring) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return [...ring, first];
  return ring;
}
