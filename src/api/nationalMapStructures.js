/**
 * USGS National Map — Structures MapServer (carto.nationalmap.gov).
 * Layer 56 = Colleges/Universities (point features).
 * https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer
 */

export const NATIONAL_MAP_STRUCTURES_MAPSERVER =
  'https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer';

/** Colleges / universities (National Structures dataset) */
export const NATIONAL_MAP_COLLEGES_LAYER_ID = 56;

const MAX_RECORDS = 5000;

/**
 * Query a MapServer sublayer within geographic bounds (WGS84 envelope).
 * @param {{ west: number, south: number, east: number, north: number }} bounds
 * @param {{ layerId?: number, signal?: AbortSignal }} options
 * @returns {Promise<import('geojson').FeatureCollection>}
 */
export async function fetchNationalMapStructuresInBounds(bounds, options = {}) {
  const { layerId = NATIONAL_MAP_COLLEGES_LAYER_ID, signal } = options;
  if (!bounds) {
    return { type: 'FeatureCollection', features: [] };
  }
  const { west, south, east, north } = bounds;
  const params = new URLSearchParams({
    f: 'geojson',
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    spatialRel: 'esriSpatialRelIntersects',
    geometryType: 'esriGeometryEnvelope',
    geometry: JSON.stringify({
      xmin: west,
      ymin: south,
      xmax: east,
      ymax: north,
      spatialReference: { wkid: 4326 },
    }),
    inSR: '4326',
    outSR: '4326',
    resultRecordCount: String(MAX_RECORDS),
  });

  const url = `${NATIONAL_MAP_STRUCTURES_MAPSERVER}/${layerId}/query?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`National Map structures: HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) {
    throw new Error(data.error.message || 'National Map query failed');
  }
  if (!data?.features || !Array.isArray(data.features)) {
    return { type: 'FeatureCollection', features: [] };
  }
  if (data.features.length >= MAX_RECORDS) {
    console.warn(
      `[NationalMapStructures] Hit ${MAX_RECORDS} feature cap; zoom in for full detail in this view.`
    );
  }
  return data;
}
