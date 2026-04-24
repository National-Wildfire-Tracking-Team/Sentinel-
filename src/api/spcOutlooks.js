/**
 * spcOutlooks.js
 * Fetches SPC categorical convective outlook polygons (Day 1-3)
 * from the NOAA Weather MapServer ArcGIS REST endpoint.
 * https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer
 */

import { fetchWithCache } from '../utils/dataCache';

const MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer';

// Layer IDs for categorical outlooks (Day 1, 2, 3)
const CATEGORICAL_LAYER_IDS = {
  day1: 1,
  day2: 9,
  day3: 17,
};

const RISK_LEVELS = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'];

function detectRiskCategory(properties = {}) {
  const raw = [
    properties.riskCategory,
    properties.label,
    properties.LABEL,
    properties.category,
    properties.CATEGORY,
    properties.label2,
    String(properties.dn ?? ''),
  ]
    .filter(Boolean)
    .map((v) => String(v).toUpperCase())
    .join(' ');

  const matched = RISK_LEVELS.find((risk) => raw.includes(risk));
  if (matched) return matched;

  if (raw.includes('THUNDERSTORM')) return 'TSTM';
  if (raw.includes('MARGINAL')) return 'MRGL';
  if (raw.includes('SLIGHT')) return 'SLGT';
  if (raw.includes('ENHANCED')) return 'ENH';
  if (raw.includes('MODERATE')) return 'MDT';
  if (raw.includes('HIGH')) return 'HIGH';

  return 'TSTM';
}

function normalizeFeature(feature, dayLabel, idx) {
  const properties = feature?.properties || {};
  const riskCategory = detectRiskCategory(properties);

  return {
    ...feature,
    properties: {
      ...properties,
      id: properties.objectid != null
        ? `${dayLabel}-${properties.objectid}`
        : `${dayLabel}-${riskCategory}-${idx}`,
      day: dayLabel,
      riskCategory,
      outlookLabel: properties.label2 || properties.label || properties.LABEL || riskCategory,
      // Preserve NOAA-supplied stroke/fill colors for potential direct use
      strokeColor: properties.stroke || null,
      fillColor: properties.fill || null,
      validTime: properties.valid || null,
      expireTime: properties.expire || null,
      issueTime: properties.issue || null,
    },
  };
}

function ensureFeatureCollection(data, dayLabel) {
  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return {
      ...data,
      features: data.features.map((f, idx) => normalizeFeature(f, dayLabel, idx)),
    };
  }
  return { type: 'FeatureCollection', features: [] };
}

/**
 * Build the ArcGIS REST query URL for a specific categorical outlook layer.
 * Returns GeoJSON with all features and all fields.
 */
function buildLayerUrl(layerId) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'geojson',
    // Request all records (default limit is 2000, more than enough for outlook polygons)
    resultRecordCount: '500',
  });
  return `${MAPSERVER_BASE}/${layerId}/query?${params.toString()}`;
}

export async function fetchSpcOutlookDay(dayLabel) {
  const layerId = CATEGORICAL_LAYER_IDS[dayLabel];
  if (layerId == null) throw new Error(`Unsupported SPC outlook day: ${dayLabel}`);

  const url = buildLayerUrl(layerId);
  const data = await fetchWithCache(url, `spc:outlook:noaa:${dayLabel}`, {}, 5 * 60 * 1000);
  return ensureFeatureCollection(data, dayLabel);
}

export async function fetchSpcOutlooks() {
  const [day1, day2, day3] = await Promise.all([
    fetchSpcOutlookDay('day1'),
    fetchSpcOutlookDay('day2'),
    fetchSpcOutlookDay('day3'),
  ]);

  return {
    type: 'FeatureCollection',
    features: [...day1.features, ...day2.features, ...day3.features],
  };
}
