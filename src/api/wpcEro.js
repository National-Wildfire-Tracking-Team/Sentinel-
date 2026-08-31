/**
 * wpcEro.js
 * Fetches NOAA Weather Prediction Center Excessive Rainfall Outlook (ERO)
 * polygons (Day 1-3) from the public ArcGIS REST endpoint:
 * https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer
 *
 * Layers 0-2 = Day 1-3 (layers 3-4 exist for Day 4-5 but aren't part of the
 * official ERO product name, so they're omitted here).
 *
 * Risk categories (lowest -> highest): Marginal, Slight, Moderate, High.
 * Unlike SPC's convective outlook service, this MapServer does not supply
 * fill/stroke colors, so a fixed client-side palette is used — the same
 * hex values already used elsewhere in this app for the equivalent severity
 * rung (yellow/red/magenta shared with the Fire Weather Outlook palette).
 */

import { fetchWpcLayer } from './wpcShared';

const MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer';

// Map day -> MapServer layer ID
export const ERO_LAYER_ID_MAP = {
  day1: 0,
  day2: 1,
  day3: 2,
};

export const ERO_DAYS = [
  { key: 'day1', label: 'Day 1' },
  { key: 'day2', label: 'Day 2' },
  { key: 'day3', label: 'Day 3' },
];

// Risk levels ordered lowest -> highest
export const ERO_RISK_LEVELS = ['MARGINAL', 'SLIGHT', 'MODERATE', 'HIGH'];

export const ERO_COLORS = {
  MARGINAL: { fill: '#7FBF7F', stroke: '#2E8B3D' },
  SLIGHT:   { fill: '#FFE066', stroke: '#DDAA00' },
  MODERATE: { fill: '#FF6666', stroke: '#CC0000' },
  HIGH:     { fill: '#FF00FF', stroke: '#990099' },
};

function detectRiskCategory(properties = {}) {
  const dn = Number(properties.dn ?? properties.DN ?? NaN);
  if (!isNaN(dn)) {
    if (dn >= 4) return 'HIGH';
    if (dn === 3) return 'MODERATE';
    if (dn === 2) return 'SLIGHT';
    if (dn === 1) return 'MARGINAL';
  }

  const raw = String(properties.outlook ?? properties.OUTLOOK ?? properties.label ?? '').toUpperCase();
  if (raw.includes('HIGH')) return 'HIGH';
  if (raw.includes('MODERATE')) return 'MODERATE';
  if (raw.includes('SLIGHT')) return 'SLIGHT';
  if (raw.includes('MARGINAL')) return 'MARGINAL';
  return null;
}

function normalizeFeature(feature, dayLabel, idx) {
  const properties = feature?.properties || {};
  const riskCategory = detectRiskCategory(properties);
  const colors = riskCategory ? ERO_COLORS[riskCategory] : null;

  return {
    ...feature,
    properties: {
      ...properties,
      id: properties.objectid != null
        ? `wpc-ero-${dayLabel}-${properties.objectid}`
        : `wpc-ero-${dayLabel}-${idx}`,
      day: dayLabel,
      riskCategory,
      outlookLabel: properties.outlook || properties.OUTLOOK || riskCategory || '',
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
 * Fetch the Excessive Rainfall Outlook polygons for a specific day.
 * @param {'day1'|'day2'|'day3'} dayLabel
 */
export async function fetchEroLayer(dayLabel) {
  const layerId = ERO_LAYER_ID_MAP[dayLabel];
  if (layerId == null) throw new Error(`Unsupported ERO day: ${dayLabel}`);

  const url = buildLayerUrl(layerId);
  const cacheKey = `wpc:ero:${dayLabel}`;
  const data = await fetchWpcLayer(url, cacheKey);
  return ensureFeatureCollection(data, dayLabel);
}
