/**
 * nhcTropicalWeather.js
 * Fetches active hurricane data from the NHC/Esri ArcGIS Feature Service
 * used by the vannizhang/hurricane reference implementation.
 *
 * FeatureServer/0 – Forecast track positions (points, future)
 * FeatureServer/2 – Observed track positions (points, past)
 * FeatureServer/3 – Observed track line
 * FeatureServer/4 – Forecast error cone (polygon)
 *
 * Key fields: STORMNAME, TCDVLP, MAXWIND, GUST, DATELBL, FLDATELBL, BASIN, TIMEZONE
 */

import { fetchWithCache } from '../utils/dataCache';

const FEATURE_SERVICE =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer';

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

// Wind speed thresholds from vannizhang/hurricane HurricaneData.js
export function getHurricaneCategory(maxWindMph) {
  const w = Number(maxWindMph);
  if (isNaN(w))   return 'Tropical Depression';
  if (w > 136)    return 'Category 5';
  if (w > 112)    return 'Category 4';
  if (w > 95)     return 'Category 3';
  if (w > 82)     return 'Category 2';
  if (w > 63)     return 'Category 1';
  if (w > 33)     return 'Tropical Storm';
  return 'Tropical Depression';
}

function normalizeTrackFeature(feature, idx) {
  const p = feature?.properties || {};
  const category = getHurricaneCategory(p.MAXWIND);
  const colors = HURRICANE_CATEGORY_COLORS[category];
  return {
    ...feature,
    properties: {
      ...p,
      id:          p.OBJECTID != null ? `nhc-track-${p.OBJECTID}` : `nhc-track-${idx}`,
      stormName:   p.STORMNAME  || '',
      stormType:   p.TCDVLP    || '',
      maxWind:     p.MAXWIND    || 0,
      gust:        p.GUST       || 0,
      basin:       p.BASIN      || '',
      dateLabel:   p.DATELBL    || p.FLDATELBL || '',
      category,
      fillColor:   colors.fill,
      strokeColor: colors.stroke,
    },
  };
}

function normalizeObservedFeature(feature, idx) {
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

function normalizeConeFeature(feature, idx) {
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

function ensureFC(data, normalizeFn) {
  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return { ...data, features: data.features.map((f, i) => normalizeFn(f, i)) };
  }
  return { type: 'FeatureCollection', features: [] };
}

function buildQuery(layerId) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'geojson',
    resultRecordCount: '500',
  });
  return `${FEATURE_SERVICE}/${layerId}/query?${params}`;
}

/** Forecast track positions (points) – FeatureServer/0 */
export async function fetchNhcTrack() {
  const data = await fetchWithCache(buildQuery(0), 'nhc:track', {}, 5 * 60 * 1000);
  return ensureFC(data, normalizeTrackFeature);
}

/** Observed (past) track positions (points) – FeatureServer/2 */
export async function fetchNhcObservedTrack() {
  const data = await fetchWithCache(buildQuery(2), 'nhc:observed', {}, 5 * 60 * 1000);
  return ensureFC(data, normalizeObservedFeature);
}

/**
 * Build a label GeoJSON from track points: one Point feature per storm
 * at the first forecast position (current location), carrying the name.
 */
export function buildStormLabels(trackFC) {
  if (!trackFC?.features?.length) return { type: 'FeatureCollection', features: [] };

  const storms = {};
  for (const f of trackFC.features) {
    const name = f.properties?.stormName || '';
    if (!name || !f.geometry?.coordinates) continue;
    if (!storms[name]) storms[name] = f; // first occurrence = earliest forecast point
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

/** Forecast error cone (polygon) – FeatureServer/4 */
export async function fetchNhcCone() {
  const data = await fetchWithCache(buildQuery(4), 'nhc:cone', {}, 5 * 60 * 1000);
  return ensureFC(data, normalizeConeFeature);
}

/** Fetch all layers together */
export async function fetchNhcTropicalWeather() {
  const [track, observedTrack, cone] = await Promise.all([
    fetchNhcTrack(),
    fetchNhcObservedTrack(),
    fetchNhcCone(),
  ]);
  return { track, observedTrack, cone };
}
