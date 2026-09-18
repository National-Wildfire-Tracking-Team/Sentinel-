/**
 * CAL FIRE FRAP — California Land Ownership (public agency ownership
 * polygons: Federal, State, Tribal, County, City, Special District, Non
 * Profit). Source is CNRA's hosted ArcGIS FeatureServer view. Pro-only layer
 * — see usePlan.js's hasProInfrastructureAccess.
 */

const PROXY_URL = import.meta.env.VITE_CALIFORNIA_LAND_OWNERSHIP_PROXY_URL || null;

const FEATURE_LAYER_URL =
  '/api/arcgis/ca-land-ownership/0/query';

const OUT_FIELDS = ['Own_Level', 'Own_Agency', 'Own_Group'].join(',');

// Drops ownership polygon vertex density well below what's visible at the
// close-in zoom this layer only loads at (see useCaliforniaLandOwnership.js)
// — cuts a typical viewport's payload from ~300KB to ~25KB with no visible
// difference in the rendered fill.
const SIMPLIFY_OFFSET_DEG = 0.00005;

/**
 * Direct-to-ArcGIS fallback, used until VITE_CALIFORNIA_LAND_OWNERSHIP_PROXY_URL
 * is set (see cloud/california-land-ownership-proxy/README.md) — same bbox
 * filter and simplification, just without the shared cache.
 */
async function fetchDirect(bounds) {
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
    maxAllowableOffset: String(SIMPLIFY_OFFSET_DEG),
    f: 'geojson',
    resultRecordCount: '2000',
  });

  const res = await fetch(`${FEATURE_LAYER_URL}?${params}`);
  if (!res.ok) throw new Error(`Land ownership fetch failed: ${res.status}`);
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || 'ArcGIS query error');
  }
  if (!json?.features) {
    return { type: 'FeatureCollection', features: [] };
  }
  return json;
}

async function fetchFromProxy(bounds) {
  const { west, south, east, north } = bounds;
  const params = new URLSearchParams({ bbox: `${west},${south},${east},${north}` });
  const res = await fetch(`${PROXY_URL}/land-ownership?${params}`);
  if (!res.ok) throw new Error(`Land ownership proxy fetch failed: ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error);
  if (!json?.features) {
    return { type: 'FeatureCollection', features: [] };
  }
  return json;
}

/**
 * @param {{ west: number, south: number, east: number, north: number }} bounds WGS84 degrees
 * @returns {Promise<import('geojson').FeatureCollection>}
 */
export async function fetchCaliforniaLandOwnershipInBounds(bounds) {
  return PROXY_URL ? fetchFromProxy(bounds) : fetchDirect(bounds);
}
