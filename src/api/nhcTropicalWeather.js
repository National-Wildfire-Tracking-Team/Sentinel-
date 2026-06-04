/**
 * nhcTropicalWeather.js
 * Fetches NHC hurricane data from two complementary sources:
 *
 * SOURCE A – Esri Active_Hurricanes_v1 FeatureServer (vannizhang/hurricane)
 *   FeatureServer/0 – Forecast track positions (future, points)
 *   FeatureServer/2 – Observed track positions (past, points)
 *   FeatureServer/4 – Forecast error cone (polygon)
 *
 * SOURCE B – NOAA NHC tropical weather MapServer
 *   Layer 320       – Tropical disturbance outlook areas (pre-named-storm)
 *
 * Each source fails independently; the other still renders.
 */

import { fetchWithCache } from '../utils/dataCache';

const ESRI_SERVICE =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer';

const NOAA_MAPSERVER =
  'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';

// Standard NHC/SSHWS category colors
export const HURRICANE_CATEGORY_COLORS = {
  'Tropical Depression': { fill: '#5ebaff', stroke: '#2e8fbf' },
  'Tropical Storm':      { fill: '#00faf4', stroke: '#00b8b3' },
  'Category 1':          { fill: '#ffffcc', stroke: '#cccc66' },
  'Category 2':          { fill: '#ffe775', stroke: '#ccaa00' },
  'Category 3':          { fill: '#ffc140', stroke: '#cc8800' },
  'Category 4':          { fill: '#ff8f20', stroke: '#cc5500' },
  'Category 5':          { fill: '#ff6060', stroke: '#cc0000' },
};

// NHC disturbance formation probability colors
export const DISTURBANCE_COLORS = {
  HIGH:   { fill: '#FF4444', stroke: '#BB0000' },
  MEDIUM: { fill: '#FFA040', stroke: '#CC5500' },
  LOW:    { fill: '#FFE566', stroke: '#CCAA00' },
};

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getHurricaneCategory(maxWindMph) {
  const w = Number(maxWindMph);
  if (isNaN(w))  return 'Tropical Depression';
  if (w > 136)   return 'Category 5';
  if (w > 112)   return 'Category 4';
  if (w > 95)    return 'Category 3';
  if (w > 82)    return 'Category 2';
  if (w > 63)    return 'Category 1';
  if (w > 33)    return 'Tropical Storm';
  return 'Tropical Depression';
}

function detectFormationChance(p = {}) {
  const raw = [p.PROB2DAY, p.PROB5DAY, p.FormationChance, p.label, p.LABEL]
    .filter(Boolean).map(v => String(v).toUpperCase()).join(' ');
  if (raw.includes('HIGH'))   return 'HIGH';
  if (raw.includes('MEDIUM')) return 'MEDIUM';
  if (raw.includes('LOW'))    return 'LOW';
  return 'LOW';
}

function ensureFC(data, normalizeFn) {
  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return { ...data, features: data.features.map((f, i) => normalizeFn(f, i)) };
  }
  return EMPTY_FC;
}

function buildEsriQuery(layerId) {
  return `${ESRI_SERVICE}/${layerId}/query?${new URLSearchParams({
    where: '1=1', outFields: '*', f: 'geojson', resultRecordCount: '500',
  })}`;
}

function buildNoaaQuery(layerId) {
  return `${NOAA_MAPSERVER}/${layerId}/query?${new URLSearchParams({
    where: '1=1', outFields: '*', f: 'geojson', resultRecordCount: '500',
  })}`;
}

// Wrap fetch so a single layer failure returns EMPTY_FC instead of throwing
async function safeFetch(url, cacheKey, ttlMs = 5 * 60 * 1000) {
  try {
    const data = await fetchWithCache(url, cacheKey, {}, ttlMs);
    return data;
  } catch {
    return EMPTY_FC;
  }
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeForecast(feature, idx) {
  const p = feature?.properties || {};
  const category = getHurricaneCategory(p.MAXWIND);
  const colors = HURRICANE_CATEGORY_COLORS[category];
  return {
    ...feature,
    properties: {
      ...p,
      id:          p.OBJECTID != null ? `nhc-track-${p.OBJECTID}` : `nhc-track-${idx}`,
      stormName:   p.STORMNAME || '',
      stormType:   p.TCDVLP   || '',
      maxWind:     p.MAXWIND   || 0,
      gust:        p.GUST      || 0,
      basin:       p.BASIN     || '',
      dateLabel:   p.DATELBL   || p.FLDATELBL || '',
      category,
      fillColor:   colors.fill,
      strokeColor: colors.stroke,
    },
  };
}

function normalizeObserved(feature, idx) {
  const p = feature?.properties || {};
  const category = getHurricaneCategory(p.MAXWIND);
  return {
    ...feature,
    properties: {
      ...p,
      id:        p.OBJECTID != null ? `nhc-obs-${p.OBJECTID}` : `nhc-obs-${idx}`,
      stormName: p.STORMNAME || '',
      stormType: p.TCDVLP   || '',
      maxWind:   p.MAXWIND   || 0,
      gust:      p.GUST      || 0,
      dateLabel: p.DATELBL   || p.FLDATELBL || '',
      category,
      observed:  true,
    },
  };
}

function normalizeCone(feature, idx) {
  const p = feature?.properties || {};
  return {
    ...feature,
    properties: {
      ...p,
      id:        p.OBJECTID != null ? `nhc-cone-${p.OBJECTID}` : `nhc-cone-${idx}`,
      stormName: p.STORMNAME || '',
    },
  };
}

function normalizeDisturbance(feature, idx) {
  const p = feature?.properties || {};
  const formationChance = detectFormationChance(p);
  const colors = DISTURBANCE_COLORS[formationChance];
  return {
    ...feature,
    properties: {
      ...p,
      id:             p.OBJECTID != null ? `nhc-dist-${p.OBJECTID}` : `nhc-dist-${idx}`,
      formationChance,
      fillColor:      colors.fill,
      strokeColor:    colors.stroke,
    },
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** Derive one label point per storm from forecast track features */
export function buildStormLabels(trackFC) {
  if (!trackFC?.features?.length) return EMPTY_FC;
  const storms = {};
  for (const f of trackFC.features) {
    const name = f.properties?.stormName || '';
    if (!name || !f.geometry?.coordinates) continue;
    if (!storms[name]) storms[name] = f;
  }
  return {
    type: 'FeatureCollection',
    features: Object.values(storms).map(f => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: f.geometry.coordinates },
      properties: {
        stormName: f.properties.stormName,
        stormType: f.properties.stormType,
        category:  f.properties.category,
      },
    })),
  };
}

/** Forecast track – FeatureServer/0 */
export async function fetchNhcTrack() {
  const data = await safeFetch(buildEsriQuery(0), 'nhc:track');
  return ensureFC(data, normalizeForecast);
}

/** Observed (past) track – FeatureServer/2 */
export async function fetchNhcObservedTrack() {
  const data = await safeFetch(buildEsriQuery(2), 'nhc:observed');
  return ensureFC(data, normalizeObserved);
}

/** Forecast error cone – FeatureServer/4 */
export async function fetchNhcCone() {
  const data = await safeFetch(buildEsriQuery(4), 'nhc:cone');
  return ensureFC(data, normalizeCone);
}

/** Tropical disturbance outlook – NOAA MapServer layer 320 */
export async function fetchNhcDisturbanceOutlook() {
  const data = await safeFetch(buildNoaaQuery(320), 'nhc:disturbance', 10 * 60 * 1000);
  return ensureFC(data, normalizeDisturbance);
}

/**
 * Fetch all four NHC layers. Each resolves independently — a failure in
 * one source never prevents the others from rendering.
 */
export async function fetchNhcTropicalWeather() {
  const [trackRes, observedRes, coneRes, disturbanceRes] = await Promise.allSettled([
    fetchNhcTrack(),
    fetchNhcObservedTrack(),
    fetchNhcCone(),
    fetchNhcDisturbanceOutlook(),
  ]);

  return {
    track:       trackRes.status       === 'fulfilled' ? trackRes.value       : EMPTY_FC,
    observedTrack: observedRes.status  === 'fulfilled' ? observedRes.value     : EMPTY_FC,
    cone:        coneRes.status        === 'fulfilled' ? coneRes.value         : EMPTY_FC,
    disturbance: disturbanceRes.status === 'fulfilled' ? disturbanceRes.value  : EMPTY_FC,
  };
}
