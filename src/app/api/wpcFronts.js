/**
 * wpcFronts.js
 * Fetches NOAA Weather Prediction Center surface-analysis fronts (Day 1-3)
 * from the public ArcGIS REST endpoint:
 * https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer
 *
 * That "National Forecast Chart" service also publishes highs/lows points
 * and precip-type/hazard-zone polygons per day; the Fronts polylines and the
 * Highs and Lows points are surfaced here. The live analysis ("Now") comes
 * from wpcSurfaceAnalysis.js instead.
 *
 * Front types come from the `feat` field as free text (e.g. "Cold Front
 * Valid: Mon Aug 31 2026") — parsed by substring match since the service
 * doesn't expose a clean enum field.
 */

import { fetchWpcLayer } from './wpcShared';

const MAPSERVER_BASE =
  '/api/nws/wpc-fronts';

// Map day -> MapServer layer ID (Fronts sublayers)
export const FRONTS_LAYER_ID_MAP = {
  day1: 2,
  day2: 14,
  day3: 26,
};

// Map day -> MapServer layer ID (Highs and Lows points; no pressure values)
export const CENTERS_LAYER_ID_MAP = {
  day1: 1,
  day2: 13,
  day3: 25,
};

export const FRONTS_DAYS = [
  { key: 'now', label: 'Now' },
  { key: 'day1', label: 'Day 1' },
  { key: 'day2', label: 'Day 2' },
  { key: 'day3', label: 'Day 3' },
];

export const FRONT_TYPES = ['COLD', 'WARM', 'STATIONARY', 'OCCLUDED', 'TROUGH', 'DRYLINE', 'SQUALL'];

// NOAA/WPC surface-analysis chart colors (see frontSymbols.js for the symbols)
export const FRONT_COLORS = {
  COLD:       '#0050FF',
  WARM:       '#FF0000',
  STATIONARY: '#FF0000', // drawn alternating red/blue
  OCCLUDED:   '#A020F0',
  TROUGH:     '#D2691E',
  DRYLINE:    '#C28A3A',
  SQUALL:     '#A020F0',
};

const FRONT_DASH = {
  COLD:       null,
  WARM:       null,
  STATIONARY: null,
  OCCLUDED:   null,
  TROUGH:     [3, 2],
  DRYLINE:    null,
  SQUALL:     [3, 1, 1, 1],
};

function detectFrontType(properties = {}) {
  const raw = String(properties.feat ?? properties.FEAT ?? '').toUpperCase();
  if (raw.includes('STATIONARY')) return 'STATIONARY';
  if (raw.includes('OCCLUDED')) return 'OCCLUDED';
  if (raw.includes('COLD')) return 'COLD';
  if (raw.includes('WARM')) return 'WARM';
  if (raw.includes('TROUGH')) return 'TROUGH';
  if (raw.includes('DRY')) return 'DRYLINE';
  if (raw.includes('SQUALL')) return 'SQUALL';
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

/** Add the map styling fields (color, dashed) to fronts that already carry `frontType`. */
export function styleFronts(fc) {
  return {
    type: 'FeatureCollection',
    features: (fc?.features ?? []).map((f) => {
      const t = f.properties?.frontType;
      return {
        ...f,
        properties: { ...f.properties, color: t ? FRONT_COLORS[t] : null, dashed: t ? FRONT_DASH[t] != null : false },
      };
    }),
  };
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

/**
 * Fetch a forecast day's highs and lows (letters only; this service carries
 * no central pressures).
 * @param {'day1'|'day2'|'day3'} dayLabel
 */
export async function fetchCentersLayer(dayLabel) {
  const layerId = CENTERS_LAYER_ID_MAP[dayLabel];
  if (layerId == null) throw new Error(`Unsupported highs/lows day: ${dayLabel}`);
  const data = await fetchWpcLayer(buildLayerUrl(layerId), `wpc:centers:${dayLabel}`);
  const features = (data?.features ?? [])
    .map((f) => {
      const feat = String(f?.properties?.feat ?? '').toUpperCase();
      const kind = feat.startsWith('HIGH') ? 'H' : feat.startsWith('LOW') ? 'L' : null;
      if (!kind || f?.geometry?.type !== 'Point') return null;
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: { kind, pressure: null, label: kind === 'H' ? 'High' : 'Low' },
      };
    })
    .filter(Boolean);
  return { type: 'FeatureCollection', features };
}
