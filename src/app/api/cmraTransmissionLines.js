/**
 * CMRA / ArcGIS — U.S. Electric Power Transmission Lines (Climate Mapping for Resilience and Adaptation).
 * Portal: https://resilience.climate.gov/datasets/d4090758322c4d32a4cd002ffaa0aa12_0
 */

const FEATURE_LAYER_URL =
  'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0/query';

const OUT_FIELDS = [
  'OBJECTID',
  'ID',
  'TYPE',
  'STATUS',
  'OWNER',
  'VOLTAGE',
  'VOLT_CLASS',
  'NAICS_DESC',
  'SOURCE',
].join(',');

/**
 * @param {{ west: number, south: number, east: number, north: number }} bounds WGS84 degrees
 * @returns {Promise<import('geojson').FeatureCollection>}
 */
export async function fetchTransmissionLinesInBounds(bounds) {
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
  if (!res.ok) throw new Error(`Transmission lines fetch failed: ${res.status}`);
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || 'ArcGIS query error');
  }
  if (!json?.features) {
    return { type: 'FeatureCollection', features: [] };
  }
  return json;
}
