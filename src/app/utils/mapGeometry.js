/**
 * mapGeometry.js
 * Small GeoJSON geometry helpers for the map popup: finding a representative
 * anchor point for a clicked feature, and building a "spotlight" mask that
 * dims everywhere except a clicked polygon.
 */

/** Unweighted average of a ring's vertices — good enough for anchoring a popup, not a true centroid. */
function ringAverage(ring) {
  let x = 0;
  let y = 0;
  for (const [lng, lat] of ring) {
    x += lng;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

/**
 * Representative [lng, lat] for a feature's geometry, used to anchor the
 * popup when the "Data Picker" preference is set to 'center' rather than
 * the exact click point.
 */
export function getGeometryCenter(geometry) {
  if (!geometry) return null;
  switch (geometry.type) {
    case 'Point':
      return geometry.coordinates;
    case 'Polygon':
      return ringAverage(geometry.coordinates[0]);
    case 'MultiPolygon':
      return ringAverage(geometry.coordinates[0][0]);
    case 'LineString':
      return geometry.coordinates[Math.floor(geometry.coordinates.length / 2)];
    case 'MultiLineString':
      return geometry.coordinates[0][Math.floor(geometry.coordinates[0].length / 2)];
    default:
      return null;
  }
}

const WORLD_RING = [
  [-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85],
];

/**
 * Builds a mask polygon covering the whole world with the given geometry's
 * rings punched out as holes — i.e. "everywhere except this shape". Used to
 * dim the map outside a clicked polygon (Popup Spotlight). Mapbox GL
 * normalizes ring winding for GeoJSON sources, so exact winding direction
 * doesn't matter here.
 * Returns null for non-polygon geometries (points, lines) since there's no
 * shape to spotlight.
 */
export function buildInvertedMask(geometry) {
  if (!geometry) return null;
  let polygons;
  if (geometry.type === 'Polygon') polygons = [geometry.coordinates];
  else if (geometry.type === 'MultiPolygon') polygons = geometry.coordinates;
  else return null;

  const holes = polygons.flatMap((rings) => rings);
  if (holes.length === 0) return null;

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [WORLD_RING, ...holes],
    },
  };
}
