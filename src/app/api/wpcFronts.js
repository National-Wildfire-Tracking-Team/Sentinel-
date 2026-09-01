/**
 * wpcFronts.js
 * Fetches NOAA Weather Prediction Center surface-analysis fronts (Day 1-3)
 * from the public ArcGIS REST endpoint:
 * https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer
 *
 * That "National Forecast Chart" service also publishes highs/lows points
 * and precip-type/hazard-zone polygons per day; only the Fronts polyline
 * sublayer is surfaced here.
 *
 * Front types come from the `feat` field as free text (e.g. "Cold Front
 * Valid: Mon Aug 31 2026") — parsed by substring match since the service
 * doesn't expose a clean enum field.
 */

import { fetchWpcLayer } from './wpcShared';

const MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer';

// Map day -> MapServer layer ID (Fronts sublayers)
export const FRONTS_LAYER_ID_MAP = {
  day1: 2,
  day2: 14,
  day3: 26,
};

export const FRONTS_DAYS = [
  { key: 'day1', label: 'Day 1' },
  { key: 'day2', label: 'Day 2' },
  { key: 'day3', label: 'Day 3' },
];

export const FRONT_TYPES = ['COLD', 'WARM', 'STATIONARY', 'OCCLUDED', 'TROUGH'];

// Standard surface-analysis chart colors, approximated as solid/dashed lines
// (traditional pip/scallop symbology needs custom line-pattern sprites, out
// of scope here).
export const FRONT_COLORS = {
  COLD:       '#2E6FDB',
  WARM:       '#DB2E2E',
  STATIONARY: '#9B59B6',
  OCCLUDED:   '#7B4FA6',
  TROUGH:     '#D97706',
};

const FRONT_DASH = {
  COLD:       null,
  WARM:       null,
  STATIONARY: [2, 1.5],
  OCCLUDED:   null,
  TROUGH:     [3, 2],
};

function detectFrontType(properties = {}) {
  const raw = String(properties.feat ?? properties.FEAT ?? '').toUpperCase();
  if (raw.includes('STATIONARY')) return 'STATIONARY';
  if (raw.includes('OCCLUDED')) return 'OCCLUDED';
  if (raw.includes('COLD')) return 'COLD';
  if (raw.includes('WARM')) return 'WARM';
  if (raw.includes('TROUGH')) return 'TROUGH';
  return null;
}

function normalizeFeature(feature, dayLabel, idx) {
  const properties = feature?.properties || {};
  const frontType = detectFrontType(properties);

  return {
    ...feature,
    properties: {
      ...properties,
      id: properties.objectid != null
        ? `wpc-fronts-${dayLabel}-${properties.objectid}`
        : `wpc-fronts-${dayLabel}-${idx}`,
      day: dayLabel,
      frontType,
      color: frontType ? FRONT_COLORS[frontType] : null,
      dashed: frontType ? FRONT_DASH[frontType] != null : false,
      label: properties.popupconte || properties.feat || '',
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
 * Fetch the surface-analysis fronts for a specific day.
 * @param {'day1'|'day2'|'day3'} dayLabel
 */
export async function fetchFrontsLayer(dayLabel) {
  const layerId = FRONTS_LAYER_ID_MAP[dayLabel];
  if (layerId == null) throw new Error(`Unsupported fronts day: ${dayLabel}`);

  const url = buildLayerUrl(layerId);
  const cacheKey = `wpc:fronts:${dayLabel}`;
  const data = await fetchWpcLayer(url, cacheKey);
  return ensureFeatureCollection(data, dayLabel);
}
