/**
 * EIA / ArcGIS — U.S. natural gas interstate and intrastate pipelines (EIA-176).
 * Same ArcGIS org as CMRA transmission lines; public query endpoint.
 */

const FEATURE_LAYER_URL =
  'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services' +
  '/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0/query';

const OUT_FIELDS = ['FID', 'TYPEPIPE', 'Operator', 'Status', 'Shape_Leng', 'Shape__Length'].join(',');

/**
 * @param {{ west: number, south: number, east: number, north: number }} bounds WGS84 degrees
 * @returns {Promise<import('geojson').FeatureCollection>}
 */
export async function fetchGasPipelinesInBounds(bounds) {
  const { west, south, east, north } = bounds;
  const geometry = {
    xmin: west,
    ymin: south,
    xmax: east,
    ymax: north,
    spatialReference: { wkid: 4326 },
  };

  const params = new URLSearchParams({
    geometry: JSON.stringify(geometry),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outSR: '4326',
    where: '1=1',
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    f: 'geojson',
    resultRecordCount: '2000',
  });

  const res = await fetch(`${FEATURE_LAYER_URL}?${params}`);
  if (!res.ok) throw new Error(`Gas pipelines fetch failed: ${res.status}`);
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || 'ArcGIS query error');
  }
  if (!json?.features) {
    return { type: 'FeatureCollection', features: [] };
  }
  return json;
}
