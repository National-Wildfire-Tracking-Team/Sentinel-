/**
 * spcFireWeatherOutlooks.js
 * Fetches SPC Fire Weather Outlook polygons (Day 1-8) from the
 * NOAA Weather MapServer ArcGIS REST endpoint.
 * https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer
 *
 * Risk categories:
 *   ELEVATED  (dn=5)  – Elevated risk from wind/RH or dry thunderstorms
 *   CRITICAL  (dn=8)  – Critical risk from wind/RH or dry thunderstorms
 *   EXTREME   (dn=10) – Extremely critical risk from wind/RH
 *
 * Outlook types per day:
 *   Day 1-2: winds_low_humidity (dn 5/8/10), dry_thunderstorm (dn 5/8)
 *   Day 3-8: winds_low_humidity, dry_thunderstorm
 */

import { fetchWithCache } from '../utils/dataCache';

const MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer';

// Map (day, type) → MapServer layer ID
// Layer structure from MapServer:
//   0: Day 1 Group  → 1: Day 1 Outlook (winds/RH), 2: Day 1 Dry Thunderstorm
//   3: Day 2 Group  → 4: Day 2 Outlook,             5: Day 2 Dry Thunderstorm
//   6: Day 3 Group  → 7: Day 3 Dry Thunderstorm,     8: Day 3 Winds/Low Humidity
//   9: Day 4 Group  → 10: Day 4 Dry Thunderstorm,    11: Day 4 Winds/Low Humidity
//   etc.
export const FIRE_WX_LAYER_ID_MAP = {
  day1: { winds_low_humidity: 1, dry_thunderstorm: 2 },
  day2: { winds_low_humidity: 4, dry_thunderstorm: 5 },
  day3: { winds_low_humidity: 8, dry_thunderstorm: 7 },
  day4: { winds_low_humidity: 11, dry_thunderstorm: 10 },
  day5: { winds_low_humidity: 14, dry_thunderstorm: 13 },
  day6: { winds_low_humidity: 17, dry_thunderstorm: 16 },
  day7: { winds_low_humidity: 20, dry_thunderstorm: 19 },
  day8: { winds_low_humidity: 23, dry_thunderstorm: 22 },
};

export const FIRE_WX_OUTLOOK_TYPES = [
  { key: 'winds_low_humidity', label: 'Wind & RH',      days: ['day1','day2','day3','day4','day5','day6','day7','day8'] },
  { key: 'dry_thunderstorm',   label: 'Dry Lightning',   days: ['day1','day2','day3','day4','day5','day6','day7','day8'] },
];

// Days available in the selector
export const FIRE_WX_DAYS = [
  { key: 'day1', label: 'Day 1' },
  { key: 'day2', label: 'Day 2' },
  { key: 'day3', label: 'Day 3' },
  { key: 'day4', label: 'Day 4' },
  { key: 'day5', label: 'Day 5' },
  { key: 'day6', label: 'Day 6' },
  { key: 'day7', label: 'Day 7' },
  { key: 'day8', label: 'Day 8' },
];

// Risk levels ordered lowest → highest
export const FIRE_WX_RISK_LEVELS = ['ELEVATED', 'CRITICAL', 'EXTREME'];

// DN → risk category mapping from NOAA documentation
const DN_TO_RISK = {
  5: 'ELEVATED',
  8: 'CRITICAL',
  10: 'EXTREME',
};

// Colors matching the official SPC Fire Weather Outlook palette
export const FIRE_WX_COLORS = {
  ELEVATED: { fill: '#FFE066', stroke: '#DDAA00' },
  CRITICAL: { fill: '#FF6666', stroke: '#CC0000' },
  EXTREME:  { fill: '#FF00FF', stroke: '#990099' },
};

// Dry thunderstorm uses a different (blueish) palette
export const FIRE_WX_DRY_LIGHTNING_COLORS = {
  ELEVATED: { fill: '#8BD8F5', stroke: '#2E86AB' },
  CRITICAL: { fill: '#3C6FCD', stroke: '#1A3A8C' },
};

function detectRiskCategory(properties = {}) {
  const dn = Number(properties.dn ?? properties.DN ?? NaN);
  if (!isNaN(dn) && DN_TO_RISK[dn]) return DN_TO_RISK[dn];

  const raw = [
    properties.label,
    properties.LABEL,
    properties.label2,
    properties.LABEL2,
    properties.riskCategory,
    properties.category,
  ]
    .filter(Boolean)
    .map(v => String(v).toUpperCase())
    .join(' ');

  if (raw.includes('EXTREME') || raw.includes('XTRM')) return 'EXTREME';
  if (raw.includes('CRITICAL') || raw.includes('CRIT')) return 'CRITICAL';
  if (raw.includes('ELEVATED') || raw.includes('ELEV')) return 'ELEVATED';
  if (raw.includes('ISODRYT') || raw.includes('ISO')) return 'ELEVATED';
  if (raw.includes('SCTDRYT') || raw.includes('SCT')) return 'CRITICAL';

  return null;
}

function normalizeFeature(feature, dayLabel, outlookType, idx) {
  const properties = feature?.properties || {};
  const riskCategory = detectRiskCategory(properties);
  const colorPalette = outlookType === 'dry_thunderstorm'
    ? FIRE_WX_DRY_LIGHTNING_COLORS
    : FIRE_WX_COLORS;
  const colors = riskCategory ? colorPalette[riskCategory] : null;

  return {
    ...feature,
    properties: {
      ...properties,
      id: properties.objectid != null
        ? `firewx-${dayLabel}-${outlookType}-${properties.objectid}`
        : `firewx-${dayLabel}-${outlookType}-${idx}`,
      day: dayLabel,
      outlookType,
      riskCategory,
      outlookLabel:
        properties.label2 || properties.LABEL2 ||
        properties.label  || properties.LABEL  ||
        riskCategory || '',
      fillColor:   properties.fill   || colors?.fill   || null,
      strokeColor: properties.stroke || colors?.stroke || null,
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
 * Fetch a single fire weather outlook layer for a specific day + type.
 * @param {'day1'|'day2'|...|'day8'} dayLabel
 * @param {'winds_low_humidity'|'dry_thunderstorm'} outlookType
 */
export async function fetchFireWeatherOutlookLayer(dayLabel, outlookType) {
  const dayLayers = FIRE_WX_LAYER_ID_MAP[dayLabel];
  if (!dayLayers) throw new Error(`Unsupported fire weather outlook day: ${dayLabel}`);

  const layerId = dayLayers[outlookType];
  if (layerId == null) throw new Error(`Unsupported outlook type "${outlookType}" for ${dayLabel}`);

  const url = buildLayerUrl(layerId);
  const cacheKey = `spc:firewx:${dayLabel}:${outlookType}`;
  const data = await fetchWithCache(url, cacheKey, {}, 5 * 60 * 1000);
  return ensureFeatureCollection(data, dayLabel, outlookType);
}

/**
 * Fetch both outlook types for a given day, merged into one FeatureCollection.
 * @param {'day1'|'day2'|...|'day8'} dayLabel
 */
export async function fetchFireWeatherOutlooksForDay(dayLabel) {
  const types = Object.keys(FIRE_WX_LAYER_ID_MAP[dayLabel] || {});
  const results = await Promise.all(types.map(t => fetchFireWeatherOutlookLayer(dayLabel, t)));
  return {
    type: 'FeatureCollection',
    features: results.flatMap(r => r.features),
  };
}
