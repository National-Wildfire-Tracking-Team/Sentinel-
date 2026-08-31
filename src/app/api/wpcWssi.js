/**
 * wpcWssi.js
 * Fetches NOAA Weather Prediction Center Winter Storm Severity Index (WSSI)
 * "Overall Impact" polygons (Day 1-3) from the public ArcGIS REST endpoint:
 * https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer
 *
 * The service also publishes Snow Amount / Snow Load / Ice Accumulation /
 * Blowing Snow component layers and a companion probability-of-impact
 * MapServer (wpc_wssi_p); only the Overall Impact category is surfaced here.
 *
 * Impact categories (lowest -> highest): Winter Weather Area, Minor,
 * Moderate, Major, Extreme. The service does not supply fill/stroke colors,
 * so a fixed client-side palette is used.
 */

import { fetchWpcLayer } from './wpcShared';

const MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer';

// Map day -> MapServer layer ID (Overall Impact sublayers)
export const WSSI_LAYER_ID_MAP = {
  day1: 1,
  day2: 2,
  day3: 3,
};

export const WSSI_DAYS = [
  { key: 'day1', label: 'Day 1' },
  { key: 'day2', label: 'Day 2' },
  { key: 'day3', label: 'Day 3' },
];

// Impact levels ordered lowest -> highest
export const WSSI_IMPACT_LEVELS = ['WINTER WEATHER AREA', 'MINOR', 'MODERATE', 'MAJOR', 'EXTREME'];

export const WSSI_COLORS = {
  'WINTER WEATHER AREA': { fill: '#B0B8C0', stroke: '#6E7680' },
  MINOR:    { fill: '#8FC1E3', stroke: '#3A7CA5' },
  MODERATE: { fill: '#3A7CA5', stroke: '#1F4E6B' },
  MAJOR:    { fill: '#8E5BA6', stroke: '#5A3570' },
  EXTREME:  { fill: '#C0392B', stroke: '#7B241C' },
};

function detectImpactCategory(properties = {}) {
  const raw = String(properties.impact ?? properties.IMPACT ?? '').toUpperCase().trim();
  return WSSI_IMPACT_LEVELS.includes(raw) ? raw : (raw || null);
}

function normalizeFeature(feature, dayLabel, idx) {
  const properties = feature?.properties || {};
  const impactCategory = detectImpactCategory(properties);
  const colors = impactCategory ? WSSI_COLORS[impactCategory] : null;

  return {
    ...feature,
    properties: {
      ...properties,
      id: properties.objectid != null
        ? `wpc-wssi-${dayLabel}-${properties.objectid}`
        : `wpc-wssi-${dayLabel}-${idx}`,
      day: dayLabel,
      impactCategory,
      fillColor:   colors?.fill   || null,
      strokeColor: colors?.stroke || null,
      validTime:   properties.valid_time || null,
      issueTime:   properties.issue_time || null,
      startTime:   properties.start_time || null,
      endTime:     properties.end_time   || null,
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
 * Fetch the WSSI Overall Impact polygons for a specific day.
 * @param {'day1'|'day2'|'day3'} dayLabel
 */
export async function fetchWssiLayer(dayLabel) {
  const layerId = WSSI_LAYER_ID_MAP[dayLabel];
  if (layerId == null) throw new Error(`Unsupported WSSI day: ${dayLabel}`);

  const url = buildLayerUrl(layerId);
  const cacheKey = `wpc:wssi:${dayLabel}`;
  const data = await fetchWpcLayer(url, cacheKey);
  return ensureFeatureCollection(data, dayLabel);
}
