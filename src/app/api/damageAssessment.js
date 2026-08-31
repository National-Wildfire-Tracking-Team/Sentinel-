/**
 * damageAssessment.js
 * NWS Damage Assessment Toolkit (DAT) — post-event storm damage surveys.
 * https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/MapServer
 *
 * Layer 0 = damage points, 1 = damage lines (tracks), 2 = damage polygons.
 * The service holds the full historical archive (200k+ points back to ~2010),
 * so every query is scoped to a rolling window on `stormdate` to keep payloads small.
 */

import { getCached, setCached, invalidateCache } from '../utils/dataCache';

export const DAMAGE_VIEWER_MAPSERVER_BASE =
  'https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/MapServer';

const DAT_LAYER_POINTS = 0;
const DAT_LAYER_LINES = 1;
const DAT_LAYER_POLYGONS = 2;

const DAMAGE_ASSESSMENT_MAX_AGE_DAYS = 30;
const DAT_PAGE_SIZE = 2000;
const DAT_CACHE_KEY = 'damage-assessment:mapserver-geojson';
const DAT_CACHE_MS = 30 * 60 * 1000;

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

function stormdateWhereClause(days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const iso = cutoff.toISOString().slice(0, 19).replace('T', ' ');
  return `stormdate >= TIMESTAMP '${iso}'`;
}

async function fetchDatLayerJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`NWS DAT: HTTP ${res.status}`);
  return res.json();
}

/** Fetches one DAT layer as GeoJSON, paginating past the service's 2000-record cap. */
async function fetchDatLayerAsGeoJSON(layerId, where, init) {
  const features = [];
  for (let offset = 0; ; offset += DAT_PAGE_SIZE) {
    const params = new URLSearchParams({
      where,
      outFields: '*',
      returnGeometry: 'true',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(DAT_PAGE_SIZE),
      orderByFields: 'objectid',
    });
    const page = await fetchDatLayerJson(
      `${DAMAGE_VIEWER_MAPSERVER_BASE}/${layerId}/query?` + params,
      init
    );
    const pageFeatures = page?.features || [];
    features.push(...pageFeatures);
    if (pageFeatures.length < DAT_PAGE_SIZE) break;
  }
  return { type: 'FeatureCollection', features };
}

function normalizeDamageProperties(feature, source) {
  const p = feature.properties || {};
  return {
    ...feature,
    properties: {
      ...p,
      id: `dat-${source}-${p.objectid}`,
      source: 'NWS DAT',
      efscale: p.efscale || 'UNKNOWN',
      stormdate: typeof p.stormdate === 'number' ? new Date(p.stormdate).toISOString() : p.stormdate || '',
      surveydate: typeof p.surveydate === 'number' ? new Date(p.surveydate).toISOString() : p.surveydate || '',
    },
  };
}

/**
 * Fetches damage points/lines/polygons surveyed within the last N days.
 * Each geometry type fails independently — one bad request doesn't blank the others.
 */
export async function fetchDamageAssessmentAsGeoJSON(options = {}) {
  const { signal, days = DAMAGE_ASSESSMENT_MAX_AGE_DAYS } = options;
  const init = { signal };
  const where = stormdateWhereClause(days);

  async function safeFetch(layerId, source) {
    try {
      const fc = await fetchDatLayerAsGeoJSON(layerId, where, init);
      return {
        type: 'FeatureCollection',
        features: fc.features.map((f) => normalizeDamageProperties(f, source)),
      };
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      return EMPTY_FC;
    }
  }

  const [points, lines, polygons] = await Promise.all([
    safeFetch(DAT_LAYER_POINTS, 'points'),
    safeFetch(DAT_LAYER_LINES, 'lines'),
    safeFetch(DAT_LAYER_POLYGONS, 'polygons'),
  ]);

  return { points, lines, polygons };
}

export async function fetchDamageAssessmentForHook(options = {}) {
  const cached = getCached(DAT_CACHE_KEY);
  if (cached !== null) return cached;
  const data = await fetchDamageAssessmentAsGeoJSON(options);
  setCached(DAT_CACHE_KEY, data, DAT_CACHE_MS);
  return data;
}

export function invalidateDamageAssessmentCache() {
  invalidateCache(DAT_CACHE_KEY);
}
