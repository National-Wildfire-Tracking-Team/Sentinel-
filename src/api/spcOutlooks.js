/**
 * spcOutlooks.js
 * Fetches SPC convective outlook polygons (Day 1-3) from the
 * NOAA Weather MapServer ArcGIS REST endpoint.
 * https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer
 *
 * Available outlook types per day:
 *   Day 1 & 2: categorical, tornado, hail, wind
 *   Day 3:     categorical, severe (combined probabilistic)
 */

import { fetchWithCache } from '../utils/dataCache';

const MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer';

// Map (day, type) → MapServer layer ID
export const LAYER_ID_MAP = {
  day1: { categorical: 1, tornado: 3, hail: 5, wind: 7 },
  day2: { categorical: 9, tornado: 11, hail: 13, wind: 15 },
  day3: { categorical: 17, severe: 19 },
};

// Outlook type descriptors for UI
export const OUTLOOK_TYPES = [
  { key: 'categorical', label: 'Categorical',      days: ['day1', 'day2', 'day3'] },
  { key: 'tornado',     label: 'Tornado Prob.',     days: ['day1', 'day2'] },
  { key: 'hail',        label: 'Hail Prob.',        days: ['day1', 'day2'] },
  { key: 'wind',        label: 'Wind Prob.',        days: ['day1', 'day2'] },
  { key: 'severe',      label: 'Severe Prob.',      days: ['day3'] },
];

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
  if (raw.includes('MARGINAL'))     return 'MRGL';
  if (raw.includes('SLIGHT'))       return 'SLGT';
  if (raw.includes('ENHANCED'))     return 'ENH';
  if (raw.includes('MODERATE'))     return 'MDT';
  if (raw.includes('HIGH'))         return 'HIGH';

  return null; // probabilistic layers have no risk category
}

function normalizeFeature(feature, dayLabel, outlookType, idx) {
  const properties = feature?.properties || {};
  const riskCategory = detectRiskCategory(properties);

  // For probabilistic layers the "dn" field is a percentage integer (e.g. 5, 10, 15 …)
  const probPct = outlookType !== 'categorical' && properties.dn != null
    ? Number(properties.dn)
    : null;

  return {
    ...feature,
    properties: {
      ...properties,
      id: properties.objectid != null
        ? `${dayLabel}-${outlookType}-${properties.objectid}`
        : `${dayLabel}-${outlookType}-${idx}`,
      day: dayLabel,
      outlookType,
      riskCategory,
      outlookLabel: properties.label2 || properties.label || properties.LABEL || riskCategory || (probPct != null ? `${probPct}%` : ''),
      probPct,
      strokeColor: properties.stroke || null,
      fillColor:   properties.fill   || null,
      validTime:   properties.valid  || null,
      expireTime:  properties.expire || null,
      issueTime:   properties.issue  || null,
    },
  };
}

function ensureFeatureCollection(data, dayLabel, outlookType) {
  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return {
      ...data,
      features: data.features.map((f, idx) => normalizeFeature(f, dayLabel, outlookType, idx)),
    };
  }
  return { type: 'FeatureCollection', features: [] };
}

function buildLayerUrl(layerId) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'geojson',
    resultRecordCount: '500',
  });
  return `${MAPSERVER_BASE}/${layerId}/query?${params.toString()}`;
}

/**
 * Fetch a single outlook layer for a specific day + type.
 * @param {'day1'|'day2'|'day3'} dayLabel
 * @param {'categorical'|'tornado'|'hail'|'wind'|'severe'} outlookType
 */
export async function fetchSpcOutlookLayer(dayLabel, outlookType) {
  const dayLayers = LAYER_ID_MAP[dayLabel];
  if (!dayLayers) throw new Error(`Unsupported SPC outlook day: ${dayLabel}`);

  const layerId = dayLayers[outlookType];
  if (layerId == null) throw new Error(`Unsupported outlook type "${outlookType}" for ${dayLabel}`);

  const url = buildLayerUrl(layerId);
  const cacheKey = `spc:outlook:noaa:${dayLabel}:${outlookType}`;
  const data = await fetchWithCache(url, cacheKey, {}, 5 * 60 * 1000);
  return ensureFeatureCollection(data, dayLabel, outlookType);
}

/**
 * Fetch a single outlook type across all days that support it,
 * merged into one FeatureCollection.
 * @param {'categorical'|'tornado'|'hail'|'wind'|'severe'} outlookType
 */
export async function fetchSpcOutlooks(outlookType = 'categorical') {
  const typeDef = OUTLOOK_TYPES.find(t => t.key === outlookType);
  const days = typeDef ? typeDef.days : ['day1', 'day2', 'day3'];

  const results = await Promise.all(days.map(d => fetchSpcOutlookLayer(d, outlookType)));
  return {
    type: 'FeatureCollection',
    features: results.flatMap(r => r.features),
  };
}
