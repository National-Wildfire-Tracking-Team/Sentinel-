/**
 * nhcHurricane.js
 * NOAA National Hurricane Center data integration.
 *
 * Sources:
 * - NHC CurrentStorms.json – active tropical cyclones metadata
 * - NHC Active Hurricanes ArcGIS FeatureServer – GIS layers (positions, forecast cones, tracks)
 *
 * @see https://www.nhc.noaa.gov/CurrentStorms.json
 * @see https://www.nhc.noaa.gov/gis/
 */

import { fetchWithCache } from '../utils/dataCache';

// ─── Endpoints ───────────────────────────────────────────────────────────────
const CURRENT_STORMS_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';

// NOAA / Esri Active Hurricanes FeatureServer (public, CORS-enabled)
const ARCGIS_BASE =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer';

const LAYER = {
  POSITIONS:     0, // Current storm positions (points)
  FORECAST_CONE: 1, // Forecast error cone (polygons)
  OBSERVED_TRACK: 2, // Observed track (lines)
  FORECAST_TRACK: 3, // Forecast track (lines)
};

const QUERY_PARAMS = 'where=1%3D1&outFields=*&f=geojson';

// Cache TTLs
const STORMS_TTL  = 5 * 60 * 1000;   // 5 min
const GIS_TTL     = 10 * 60 * 1000;  // 10 min

// ─── Saffir-Simpson classification helpers ───────────────────────────────────

/**
 * Convert wind speed (knots) to Saffir-Simpson category string.
 */
export function windToCategory(windKt) {
  const kt = Number(windKt) || 0;
  if (kt >= 137) return 'Category 5';
  if (kt >= 113) return 'Category 4';
  if (kt >= 96)  return 'Category 3';
  if (kt >= 83)  return 'Category 2';
  if (kt >= 64)  return 'Category 1';
  if (kt >= 34)  return 'Tropical Storm';
  return 'Tropical Depression';
}

/**
 * Map NHC classification code to human-readable label.
 */
export function classificationLabel(code) {
  const labels = {
    TD:  'Tropical Depression',
    TS:  'Tropical Storm',
    HU:  'Hurricane',
    MH:  'Major Hurricane',
    STD: 'Subtropical Depression',
    STS: 'Subtropical Storm',
    PTC: 'Post-Tropical Cyclone',
    TY:  'Typhoon',
    STY: 'Super Typhoon',
  };
  return labels[code] || code || 'Unknown';
}

/**
 * Category-based color (Saffir-Simpson scale).
 */
export function categoryColor(windKt) {
  const kt = Number(windKt) || 0;
  if (kt >= 137) return '#cc00cc'; // Cat 5 – magenta
  if (kt >= 113) return '#ff0000'; // Cat 4 – red
  if (kt >= 96)  return '#ff6600'; // Cat 3 – dark orange
  if (kt >= 83)  return '#ffc800'; // Cat 2 – orange-yellow
  if (kt >= 64)  return '#fffb00'; // Cat 1 – yellow
  if (kt >= 34)  return '#00faf4'; // TS – cyan
  return '#5b8def';                // TD – blue
}

// ─── Parse latitude/longitude strings ────────────────────────────────────────

function parseLatStr(s) {
  if (typeof s === 'number') return s;
  const str = String(s).trim();
  const num = parseFloat(str);
  return str.endsWith('S') ? -num : num;
}

function parseLonStr(s) {
  if (typeof s === 'number') return s;
  const str = String(s).trim();
  const num = parseFloat(str);
  return str.endsWith('W') ? -num : num;
}

// ─── Normalize a storm entry from CurrentStorms.json ─────────────────────────

function normalizeStorm(raw) {
  const lat = raw.latitudeNumeric ?? parseLatStr(raw.latitude);
  const lng = raw.longitudeNumeric ?? parseLonStr(raw.longitude);
  const windKt = Number(raw.intensity) || 0;

  return {
    id:             raw.id || raw.binNumber || 'unknown',
    binNumber:      raw.binNumber || '',
    name:           raw.name || 'Unnamed',
    classification: raw.classification || '',
    classLabel:     classificationLabel(raw.classification),
    category:       windToCategory(windKt),
    windKt,
    windMph:        Math.round(windKt * 1.15078),
    pressure:       Number(raw.pressure) || null,
    lat,
    lng,
    movementDir:    raw.movementDir ?? raw.movementDirection ?? null,
    movementSpeed:  raw.movementSpeed ?? null,
    lastUpdate:     raw.lastUpdate || null,
    // Advisory links
    publicAdvisoryUrl:   raw.publicAdvisory?.url || null,
    forecastAdvisoryUrl: raw.forecastAdvisory?.url || null,
    forecastGraphicUrl:  raw.forecastGraphic?.url || null,
    forecastDiscussionUrl: raw.forecastDiscussion?.url || null,
    windProbabilitiesUrl: raw.windSpeedProbabilities?.url || null,
  };
}

// ─── Fetch functions ─────────────────────────────────────────────────────────

/**
 * Fetch active storms metadata from NHC CurrentStorms.json.
 * Returns an array of normalized storm objects.
 */
export async function fetchActiveStorms() {
  const data = await fetchWithCache(
    CURRENT_STORMS_URL,
    'nhc:current-storms',
    {},
    STORMS_TTL,
  );
  const storms = data?.activeStorms || [];
  return storms
    .map(normalizeStorm)
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

/**
 * Fetch GIS layer from Active Hurricanes FeatureServer.
 * Returns raw GeoJSON FeatureCollection.
 */
async function fetchGISLayer(layerIndex, cacheKeySuffix) {
  const url = `${ARCGIS_BASE}/${layerIndex}/query?${QUERY_PARAMS}`;
  try {
    const data = await fetchWithCache(
      url,
      `nhc:gis:${cacheKeySuffix}`,
      {},
      GIS_TTL,
    );
    // ArcGIS may return { type: "FeatureCollection", features: [...] } or wrapped
    if (data?.type === 'FeatureCollection') return data;
    if (data?.features) return { type: 'FeatureCollection', features: data.features };
    return { type: 'FeatureCollection', features: [] };
  } catch {
    // GIS layers are supplemental – degrade gracefully
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Fetch forecast error cone polygons.
 */
export async function fetchForecastCone() {
  return fetchGISLayer(LAYER.FORECAST_CONE, 'forecast-cone');
}

/**
 * Fetch observed track lines.
 */
export async function fetchObservedTrack() {
  return fetchGISLayer(LAYER.OBSERVED_TRACK, 'observed-track');
}

/**
 * Fetch forecast track lines.
 */
export async function fetchForecastTrack() {
  return fetchGISLayer(LAYER.FORECAST_TRACK, 'forecast-track');
}

// ─── GeoJSON conversion ──────────────────────────────────────────────────────

/**
 * Convert normalized storms array to a GeoJSON FeatureCollection of points.
 */
export function stormsToGeoJSON(storms = []) {
  return {
    type: 'FeatureCollection',
    features: storms.map((s) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [s.lng, s.lat],
      },
      properties: {
        id:             s.id,
        name:           s.name,
        classification: s.classification,
        classLabel:     s.classLabel,
        category:       s.category,
        windKt:         s.windKt,
        windMph:        s.windMph,
        pressure:       s.pressure,
        movementDir:    s.movementDir,
        movementSpeed:  s.movementSpeed,
        lastUpdate:     s.lastUpdate,
        color:          categoryColor(s.windKt),
      },
    })),
  };
}
