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

/**
 * The `count` closest Point features in a GeoJSON FeatureCollection to
 * [lng, lat], nearest first. Used to surface nearby NEXRAD radar sites on
 * the map popup. Distance is a simple equirectangular approximation
 * (longitude scaled by cos(latitude)) — plenty accurate for ranking nearby
 * stations, not meant for precise distance display.
 */
export function nearestPointFeatures([lng, lat], geojson, count = 2) {
  if (!geojson?.features?.length) return [];
  const cosLat = Math.cos((lat * Math.PI) / 180);
  return geojson.features
    .map((feature) => {
      const coords = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
      if (!coords) return null;
      const dx = (coords[0] - lng) * cosLat;
      const dy = coords[1] - lat;
      return { feature, distSq: dx * dx + dy * dy };
    })
    .filter(Boolean)
    .sort((a, b) => a.distSq - b.distSq)
    .slice(0, count)
    .map((r) => r.feature);
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
