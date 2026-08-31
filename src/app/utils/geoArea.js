/**
 * Approximate GeoJSON polygon / multipolygon area in square miles.
 * Uses the same equirectangular + shoelace approach as the map measurement tool.
 */

function ringAreaKm2(coords) {
  if (!coords || coords.length < 3) return 0;
  const lat0 = coords[0][1] * (Math.PI / 180);
  const R = 6371;
  const pts = coords.map(([lng, lat]) => {
    const φ = lat * (Math.PI / 180);
    const λ = lng * (Math.PI / 180);
    return [
      (λ - coords[0][0] * (Math.PI / 180)) * R * Math.cos(lat0),
      (φ - lat0) * R,
    ];
  });
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return Math.abs(area / 2);
}

const KM2_TO_SQ_MI = 0.386102;

/**
 * @param {import('geojson').Polygon | import('geojson').MultiPolygon | null} geometry
 * @returns {number|null}  Approximate area in mi², or null if not computable
 */
export function geometryAreaSqMi(geometry) {
  if (!geometry) return null;
  let km2 = 0;
  if (geometry.type === 'Polygon') {
    const outer = geometry.coordinates[0];
    km2 += ringAreaKm2(outer);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      const outer = poly[0];
      km2 += ringAreaKm2(outer);
    }
  } else {
    return null;
  }
  if (!Number.isFinite(km2) || km2 <= 0) return null;
  return km2 * KM2_TO_SQ_MI;
}
