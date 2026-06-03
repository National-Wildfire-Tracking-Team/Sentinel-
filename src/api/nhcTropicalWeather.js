/**
 * nhcTropicalWeather.js
 * Fetches NHC Tropical Weather outlook polygons from the NOAA NHC tropical
 * weather ArcGIS MapServer.
 * https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer
 *
 * Layer 320: Tropical Weather Outlook disturbance areas
 */

import { fetchWithCache } from '../utils/dataCache';

const MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';

// Layer IDs on the NHC tropical weather MapServer
export const NHC_LAYER_IDS = {
  tropicalOutlook: 320,
};

// Formation probability buckets used by NHC (percent 2-day / 5-day chance)
const PROB_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

function detectFormationChance(properties = {}) {
  const raw = [
    properties.FormationChance,
    properties.PROB2DAY,
    properties.PROB5DAY,
    properties.label,
    properties.LABEL,
    properties.riskCategory,
  ]
    .filter(Boolean)
    .map(v => String(v).toUpperCase())
    .join(' ');

  if (raw.includes('HIGH'))   return 'HIGH';
  if (raw.includes('MEDIUM')) return 'MEDIUM';
  if (raw.includes('LOW'))    return 'LOW';
  return null;
}

const FORMATION_COLORS = {
  LOW:    { fill: '#FFE566', stroke: '#CCAA00' },
  MEDIUM: { fill: '#FFA040', stroke: '#CC5500' },
  HIGH:   { fill: '#FF4444', stroke: '#BB0000' },
};

function normalizeFeature(feature, idx) {
  const properties = feature?.properties || {};
  const formationChance = detectFormationChance(properties);
  const colors = formationChance ? FORMATION_COLORS[formationChance] : null;

  return {
    ...feature,
    properties: {
      ...properties,
      id: properties.OBJECTID != null
        ? `nhc-tropical-${properties.OBJECTID}`
        : `nhc-tropical-${idx}`,
      formationChance,
      fillColor:   colors?.fill   || null,
      strokeColor: colors?.stroke || null,
    },
  };
}

function ensureFeatureCollection(data) {
  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return {
      ...data,
      features: data.features.map((f, idx) => normalizeFeature(f, idx)),
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

export async function fetchNhcTropicalWeather() {
  const url = buildLayerUrl(NHC_LAYER_IDS.tropicalOutlook);
  const data = await fetchWithCache(url, 'nhc:tropical:320', {}, 10 * 60 * 1000);
  return ensureFeatureCollection(data);
}

export { PROB_LEVELS, FORMATION_COLORS };
