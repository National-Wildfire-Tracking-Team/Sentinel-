/**
 * nhcTropicalWeather.js
 * Single source of truth for NHC tropical weather data: the public NOAA
 * MapServer at mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather.
 *
 * That service publishes a fixed schema of 15 storm "slots" (AT1-AT5, EP1-EP5,
 * CP1-CP5 — Atlantic/East Pacific/Central Pacific), each with its own set of
 * sublayers (Forecast Points, Forecast Track, Forecast Cone, Watch-Warning,
 * Past Points, Past Track, ...). A slot is "active" when its Forecast Points
 * layer returns features; inactive slots return empty results, which is how
 * NHC signals "no storm here right now" rather than omitting the layer.
 *
 * Basin-wide (non-slot) layers 1 and 3 carry the Tropical Weather Outlook —
 * pre-genesis disturbance locations and their 7-day formation-potential areas.
 *
 * Layer IDs aren't stable across service updates, so they're resolved by name
 * once per session via /layers?f=json rather than hardcoded.
 */

import { fetchWithCache } from '../utils/dataCache';

const BASE =
  'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';

const STORM_SLOTS = [
  'AT1', 'AT2', 'AT3', 'AT4', 'AT5',
  'EP1', 'EP2', 'EP3', 'EP4', 'EP5',
  'CP1', 'CP2', 'CP3', 'CP4', 'CP5',
];

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

// NHC tropical weather outlook formation-probability colors
export const DISTURBANCE_COLORS = {
  HIGH:   { fill: '#FF4444', stroke: '#BB0000' },
  MEDIUM: { fill: '#FFA040', stroke: '#CC5500' },
  LOW:    { fill: '#FFE566', stroke: '#CCAA00' },
};

// Official NHC watch/warning legend colors (from the Watch-Warning layer's
// own renderer — see MapServer/<id>?f=json drawingInfo.renderer).
export const WATCH_WARNING_COLORS = {
  'Hurricane Warning':      '#FF0000',
  'Hurricane Watch':        '#FF7F7F',
  'Tropical Storm Warning': '#004DA8',
  'Tropical Storm Watch':   '#FFFF00',
  Advisory:                 '#94a3b8',
};

// tcww codes as published by the Watch-Warning layer's renderer
const WATCH_WARNING_LABELS = {
  HWA: 'Hurricane Watch',
  HWR: 'Hurricane Warning',
  TWA: 'Tropical Storm Watch',
  TWR: 'Tropical Storm Warning',
};

const EMPTY_FC = { type: 'FeatureCollection', features: [] };
const KT_TO_MPH = 1.15078;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Saffir-Simpson category from sustained wind speed in knots. */
export function getHurricaneCategory(windKt) {
  const w = Number(windKt);
  if (isNaN(w))  return 'Tropical Depression';
  if (w > 136)   return 'Category 5';
  if (w > 112)   return 'Category 4';
  if (w > 95)    return 'Category 3';
  if (w > 82)    return 'Category 2';
  if (w > 63)    return 'Category 1';
  if (w > 33)    return 'Tropical Storm';
  return 'Tropical Depression';
}

// Esri's sentinel value for "not reported" on this service is 9999.
function cleanNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n >= 9000) return null;
  return n;
}

// ─── Layer-id resolution ──────────────────────────────────────────────────────
// Resolved once per session by name; retried if a prior attempt came back empty.
let layerIdMapPromise = null;

async function getLayerIdMap() {
  if (layerIdMapPromise) {
    const map = await layerIdMapPromise;
    if (map.size > 0) return map;
  }
  layerIdMapPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/layers?f=json`);
      if (!res.ok) return new Map();
      const data = await res.json();
      const map = new Map();
      for (const l of [...(data.layers || []), ...(data.tables || [])]) {
        map.set(l.name, l.id);
      }
      return map;
    } catch {
      return new Map();
    }
  })();
  return layerIdMapPromise;
}

// ─── Query helper ─────────────────────────────────────────────────────────────

function buildQuery(id, orderBy) {
  const params = new URLSearchParams({
    where: '1=1', outFields: '*', f: 'geojson', resultRecordCount: '1000',
  });
  if (orderBy) params.set('orderByFields', orderBy);
  return `${BASE}/${id}/query?${params}`;
}

async function queryLayer(id, cacheKey, ttlMs, orderBy) {
  try {
    const data = await fetchWithCache(buildQuery(id, orderBy), cacheKey, {}, ttlMs);
    if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) return data;
    return EMPTY_FC;
  } catch {
    return EMPTY_FC;
  }
}

// ─── Normalizers (NOAA MapServer fields are lowercase) ────────────────────────

function normalizeForecastPoint(feature, idx, slot) {
  const p = feature?.properties || {};
  const maxWindKt = cleanNumber(p.maxwind) || 0;
  const category = getHurricaneCategory(maxWindKt);
  const colors = HURRICANE_CATEGORY_COLORS[category];
  const tau = cleanNumber(p.tau) ?? 0;
  return {
    ...feature,
    properties: {
      id: `nhc-fp-${slot}-${p.objectid ?? idx}`,
      slot,
      stormName:    p.stormname || '',
      stormType:    p.tcdvlp || p.dvlbl || '',
      maxWindKt,
      maxWindMph:   Math.round(maxWindKt * KT_TO_MPH),
      gustKt:       cleanNumber(p.gust) || 0,
      mslp:         cleanNumber(p.mslp),
      tau,
      isCurrent:    tau === 0,
      advisoryNum:  p.advisnum || '',
      dateLabel:    p.datelbl || '',
      fullDateLabel: p.fldatelbl || '',
      category,
      fillColor:    colors.fill,
      strokeColor:  colors.stroke,
    },
  };
}

function normalizePastPoint(feature, idx, slot) {
  const p = feature?.properties || {};
  const intensityKt = cleanNumber(p.intensity) || 0;
  const category = getHurricaneCategory(intensityKt);
  const dateLabel = p.month && p.day != null && p.hhmm ? `${p.month} ${p.day}, ${p.hhmm} UTC` : '';
  return {
    ...feature,
    properties: {
      id: `nhc-pp-${slot}-${p.objectid ?? idx}`,
      slot,
      stormName:    p.stormname || '',
      stormType:    p.stormtype || '',
      intensityKt,
      intensityMph: Math.round(intensityKt * KT_TO_MPH),
      mslp:         cleanNumber(p.mslp),
      category,
      observed:     true,
      dateLabel,
    },
  };
}

function normalizeTrackOrCone(feature, idx, slot, prefix) {
  const p = feature?.properties || {};
  return {
    ...feature,
    properties: {
      id: `${prefix}-${slot}-${p.objectid ?? idx}`,
      slot,
      stormName: p.stormname || '',
      advisoryNum: p.advisnum || '',
    },
  };
}

function normalizeWatchWarning(feature, idx, slot) {
  const p = feature?.properties || {};
  const code = String(p.tcww || '').toUpperCase();
  const wwType = WATCH_WARNING_LABELS[code] || 'Advisory';
  return {
    ...feature,
    properties: {
      id: `nhc-ww-${slot}-${p.objectid ?? idx}`,
      slot,
      stormName: p.stormname || '',
      wwType,
      color: WATCH_WARNING_COLORS[wwType] || WATCH_WARNING_COLORS.Advisory,
    },
  };
}

function classifyRisk(p) {
  const risk = String(p.risk7day || p.risk2day || '').toUpperCase();
  if (risk.includes('HIGH')) return 'HIGH';
  if (risk.includes('MEDIUM')) return 'MEDIUM';
  return 'LOW';
}

function parsePercent(v) {
  if (v == null) return null;
  const m = String(v).match(/(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

function normalizeDisturbance(feature, idx, prefix) {
  const p = feature?.properties || {};
  const formationChance = classifyRisk(p);
  const colors = DISTURBANCE_COLORS[formationChance];
  return {
    ...feature,
    properties: {
      id: `${prefix}-${p.objectid ?? idx}`,
      basin: p.basin || '',
      formationChance,
      day2Percent: parsePercent(p.prob2day),
      day7Percent: parsePercent(p.prob7day),
      risk2day: p.risk2day || '',
      risk7day: p.risk7day || '',
      fillColor: colors.fill,
      strokeColor: colors.stroke,
    },
  };
}

function normalizeAll(fc, normalizeFn, ...args) {
  if (!fc?.features?.length) return EMPTY_FC;
  return { type: 'FeatureCollection', features: fc.features.map((f, i) => normalizeFn(f, i, ...args)) };
}

// ─── Storm labels ─────────────────────────────────────────────────────────────

/** One label point per active storm, at its current (lowest-tau) forecast position. */
export function buildStormLabels(forecastPointsFC) {
  if (!forecastPointsFC?.features?.length) return EMPTY_FC;
  const bySlot = new Map();
  for (const f of forecastPointsFC.features) {
    const slot = f.properties?.slot;
    if (!slot || !f.geometry) continue;
    const existing = bySlot.get(slot);
    if (!existing || (f.properties.tau ?? Infinity) < (existing.properties.tau ?? Infinity)) {
      bySlot.set(slot, f);
    }
  }
  return {
    type: 'FeatureCollection',
    features: [...bySlot.values()].map(f => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        stormName: f.properties.stormName,
        stormType: f.properties.stormType,
        category:  f.properties.category,
      },
    })),
  };
}

// ─── Active-storm discovery + per-slot fetch ──────────────────────────────────

async function findActiveStorms(idMap) {
  const results = await Promise.allSettled(
    STORM_SLOTS.map(async (slot) => {
      const id = idMap.get(`${slot} Forecast Points`);
      if (id == null) return null;
      const fc = await queryLayer(id, `nhc:${slot}:fp`, 3 * 60 * 1000, 'tau');
      return fc.features.length ? { slot, forecastPoints: fc } : null;
    })
  );
  return results.map(r => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean);
}

async function fetchStormSlotData(slot, idMap) {
  const id = (suffix) => idMap.get(`${slot} ${suffix}`);
  const query = (suffix, cacheSuffix, ttlMs) => {
    const layerId = id(suffix);
    return layerId == null ? Promise.resolve(EMPTY_FC) : queryLayer(layerId, `nhc:${slot}:${cacheSuffix}`, ttlMs);
  };
  const [track, cone, ww, pastPoints, pastTrack] = await Promise.all([
    query('Forecast Track', 'track', 5 * 60 * 1000),
    query('Forecast Cone',  'cone',  5 * 60 * 1000),
    query('Watch-Warning',  'ww',    5 * 60 * 1000),
    query('Past Points',    'pp',    10 * 60 * 1000),
    query('Past Track',     'pt',    10 * 60 * 1000),
  ]);
  return { track, cone, ww, pastPoints, pastTrack };
}

async function queryDisturbanceLayer(idMap, name, cacheKey) {
  const id = idMap.get(name);
  if (id == null) return EMPTY_FC;
  return queryLayer(id, cacheKey, 10 * 60 * 1000, 'objectid');
}

// ─── Top-level fetch ──────────────────────────────────────────────────────────

/**
 * Fetch every active NHC tropical cyclone (forecast points/track/cone,
 * watch-warnings, past track) plus the basin-wide Tropical Weather Outlook
 * (pre-genesis disturbances). Never throws — failures degrade to empty
 * FeatureCollections so one bad layer never blanks the whole map.
 */
export async function fetchNhcTropicalWeather() {
  const idMap = await getLayerIdMap();

  const [activeStormsRes, disturbancePointsRes, disturbanceAreasRes] = await Promise.allSettled([
    findActiveStorms(idMap),
    queryDisturbanceLayer(idMap, 'Two-Day: Current Location', 'nhc:dist:pts'),
    queryDisturbanceLayer(idMap, 'Seven-Day: Potential Development Region', 'nhc:dist:areas'),
  ]);

  const activeStorms = activeStormsRes.status === 'fulfilled' ? activeStormsRes.value : [];
  const slotDataList = await Promise.allSettled(
    activeStorms.map(({ slot }) => fetchStormSlotData(slot, idMap))
  );

  const forecastPoints = [];
  const forecastTracks = [];
  const cones = [];
  const watchWarnings = [];
  const pastPoints = [];
  const pastTracks = [];

  activeStorms.forEach(({ slot, forecastPoints: fpFC }, i) => {
    fpFC.features.forEach((f, idx) => forecastPoints.push(normalizeForecastPoint(f, idx, slot)));
    const slotData = slotDataList[i].status === 'fulfilled' ? slotDataList[i].value : null;
    if (!slotData) return;
    slotData.track.features.forEach((f, idx) => forecastTracks.push(normalizeTrackOrCone(f, idx, slot, 'nhc-track')));
    slotData.cone.features.forEach((f, idx) => cones.push(normalizeTrackOrCone(f, idx, slot, 'nhc-cone')));
    slotData.ww.features.forEach((f, idx) => watchWarnings.push(normalizeWatchWarning(f, idx, slot)));
    slotData.pastPoints.features.forEach((f, idx) => pastPoints.push(normalizePastPoint(f, idx, slot)));
    slotData.pastTrack.features.forEach((f, idx) => pastTracks.push(normalizeTrackOrCone(f, idx, slot, 'nhc-past-track')));
  });

  const disturbancePoints = disturbancePointsRes.status === 'fulfilled' ? disturbancePointsRes.value : EMPTY_FC;
  const disturbanceAreas  = disturbanceAreasRes.status  === 'fulfilled' ? disturbanceAreasRes.value  : EMPTY_FC;

  return {
    forecastPointsGeoJSON:    { type: 'FeatureCollection', features: forecastPoints },
    forecastTrackGeoJSON:     { type: 'FeatureCollection', features: forecastTracks },
    coneGeoJSON:              { type: 'FeatureCollection', features: cones },
    watchWarningGeoJSON:      { type: 'FeatureCollection', features: watchWarnings },
    pastPointsGeoJSON:        { type: 'FeatureCollection', features: pastPoints },
    pastTrackGeoJSON:         { type: 'FeatureCollection', features: pastTracks },
    disturbancePointsGeoJSON: normalizeAll(disturbancePoints, normalizeDisturbance, 'nhc-dist-pt'),
    disturbanceAreasGeoJSON:  normalizeAll(disturbanceAreas, normalizeDisturbance, 'nhc-dist-area'),
  };
}
