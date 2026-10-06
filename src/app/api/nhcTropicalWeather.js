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
  '/api/nws/nhc-tropical';

const STORM_SLOTS = [
  'AT1', 'AT2', 'AT3', 'AT4', 'AT5',
  'EP1', 'EP2', 'EP3', 'EP4', 'EP5',
  'CP1', 'CP2', 'CP3', 'CP4', 'CP5',
];

// Storm category colors — matched to weatherwise.app's track-point palette
// (sampled directly from their rendered map: cyan → pale yellow → gold →
// orange → coral-pink as category increases). Tropical Depression and
// Category 5 weren't observed in a live storm at sample time, so those two
// are extrapolated to continue the same progression.
export const HURRICANE_CATEGORY_COLORS = {
  'Tropical Depression': { fill: '#a3e8f0', stroke: '#5fb8c4' },
  'Tropical Storm':      { fill: '#4dffff', stroke: '#00b8b3' },
  'Category 1':          { fill: '#ffffd9', stroke: '#d9d9a3' },
  'Category 2':          { fill: '#ffd98c', stroke: '#cc9a4d' },
  'Category 3':          { fill: '#ff9e59', stroke: '#cc6a2e' },
  'Category 4':          { fill: '#ff738a', stroke: '#cc3d59' },
  'Category 5':          { fill: '#ff4d70', stroke: '#b81f4d' },
};

/** Same palette as the storm's track points on the map. */
export function categoryColor(category) {
  return HURRICANE_CATEGORY_COLORS[category]?.fill ?? '#94a3b8';
}

/** "Category 1" → "Category 1 Hurricane"; storms and depressions as-is. */
export function categoryLabel(category) {
  return /^Category \d$/.test(category ?? '') ? `${category} Hurricane` : category;
}

// NHC tropical weather outlook formation-probability colors
export const DISTURBANCE_COLORS = {
  HIGH:   { fill: '#FF4444', stroke: '#BB0000' },
  MEDIUM: { fill: '#FFA040', stroke: '#CC5500' },
  LOW:    { fill: '#FFE566', stroke: '#CCAA00' },
};

// Official NHC watch/warning legend colors (from the Watch-Warning layer's
// own renderer — see MapServer/<id>?f=json drawingInfo.renderer). The one
// palette for the map, legend, popups and detail panel.
//
// That renderer (and the tcww field) only defines HWA/HWR/TWA/TWR — checked
// against the live service Oct 2026. NHC doesn't publish storm surge
// watches/warnings in this layer; they reach the map as NWS alerts
// ("Storm Surge Warning/Watch") on the weather alerts layer instead.
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

function buildQuery(id, orderBy, { simplifyDeg = null } = {}) {
  const params = new URLSearchParams({
    where: '1=1', outFields: '*', f: 'geojson', resultRecordCount: '1000',
  });
  if (orderBy) params.set('orderByFields', orderBy);
  // Server-side generalization: the wind products are ~30x smaller simplified
  // to a few km, with no visible change at the zooms they're read at.
  if (simplifyDeg) {
    params.set('maxAllowableOffset', String(simplifyDeg));
    params.set('geometryPrecision', '3');
  }
  return `${BASE}/${id}/query?${params}`;
}

async function queryLayer(id, cacheKey, ttlMs, orderBy, options) {
  try {
    const data = await fetchWithCache(buildQuery(id, orderBy, options), cacheKey, {}, ttlMs);
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
      advisoryDate: p.advdate || '',
      motionDirDeg: cleanNumber(p.tcdir),
      motionKt:     cleanNumber(p.tcspd),
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

// ─── Sidebar systems (one card per storm slot / outlook area) ────────────────

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Direction the storm is heading toward (degrees, 0 = N) → 16-point compass. */
export function compassPoint(deg) {
  if (!Number.isFinite(deg)) return null;
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** Bearing (degrees, toward) and speed (kt) between two forecast points. */
export function motionBetween(a, b) {
  const [lng1, lat1] = a?.geometry?.coordinates ?? [];
  const [lng2, lat2] = b?.geometry?.coordinates ?? [];
  const hours = (b?.properties?.tau ?? NaN) - (a?.properties?.tau ?? NaN);
  if (![lng1, lat1, lng2, lat2].every(Number.isFinite) || !(hours > 0)) return null;
  const rad = Math.PI / 180;
  const dLng = (lng2 - lng1) * rad;
  const y = Math.sin(dLng) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLng);
  const dirDeg = ((Math.atan2(y, x) / rad) + 360) % 360;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  const nm = 2 * 3440.065 * Math.asin(Math.sqrt(h));
  return { dirDeg, kt: nm / hours };
}

/** "W at 7 kt (8 mph)", "Stationary", or null. */
export function formatStormMotion(dirDeg, kt) {
  if (!Number.isFinite(kt)) return null;
  if (kt < 1) return 'Stationary';
  const dir = compassPoint(dirDeg);
  if (!dir) return null;
  const k = Math.round(kt);
  return `${dir} at ${k} kt (${Math.round(k * KT_TO_MPH)} mph)`;
}

/** NHC public advisory for a storm slot (EP/AT from Miami, CP from Honolulu). */
export function nhcAdvisoryUrl(slot) {
  if (!/^(AT|EP|CP)[1-5]$/.test(slot ?? '')) return 'https://www.nhc.noaa.gov/';
  const office = slot.startsWith('CP') ? 'HFO' : 'MIA';
  return `https://www.nhc.noaa.gov/text/refresh/${office}TCP${slot}+shtml/`;
}

const BASIN_NAMES = { AT: 'Atlantic', AL: 'Atlantic', EP: 'East Pacific', CP: 'Central Pacific' };

/** One cyclone per active slot, from its forecast points (lowest tau = now). */
export function buildCyclones(forecastPointsFC) {
  const bySlot = new Map();
  for (const f of forecastPointsFC?.features ?? []) {
    const slot = f.properties?.slot;
    if (!slot || !f.geometry) continue;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(f);
  }
  const cyclones = [];
  for (const [slot, points] of bySlot) {
    points.sort((a, b) => (a.properties.tau ?? 0) - (b.properties.tau ?? 0));
    const [now, next] = points;
    const p = now.properties;
    const [lng, lat] = now.geometry.coordinates;
    const reported = Number.isFinite(p.motionKt) && Number.isFinite(p.motionDirDeg);
    const computed = reported ? null : motionBetween(now, next);
    cyclones.push({
      id: `nhc-storm-${slot}`,
      slot,
      basin: BASIN_NAMES[slot.slice(0, 2)] ?? '',
      name: p.stormName || slot,
      stormType: p.stormType,
      category: p.category,
      maxWindKt: p.maxWindKt,
      maxWindMph: p.maxWindMph,
      gustKt: p.gustKt,
      mslp: p.mslp,
      movement: reported
        ? formatStormMotion(p.motionDirDeg, p.motionKt)
        : formatStormMotion(computed?.dirDeg, computed?.kt),
      advisoryNum: p.advisoryNum,
      advisoryDate: p.advisoryDate,
      advisoryUrl: nhcAdvisoryUrl(slot),
      lat,
      lng,
    });
  }
  // Strongest first.
  return cyclones.sort((a, b) => (b.maxWindKt ?? 0) - (a.maxWindKt ?? 0));
}

const CHANCE_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(geometry, point) {
  const polys = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.some((rings) => rings[0] && pointInRing(point, rings[0]));
}

function ringAverage(geometry) {
  const ring = geometry?.type === 'Polygon' ? geometry.coordinates[0]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates[0]?.[0] : null;
  if (!ring?.length) return null;
  // GeoJSON rings repeat the first vertex at the end; count it once.
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  const vertices = ring.length > 1 && fx === lx && fy === ly ? ring.slice(0, -1) : ring;
  const sum = vertices.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / vertices.length, sum[1] / vertices.length];
}

/**
 * Outlook systems ("invests" in the feed): one per current disturbance
 * location, plus one per 7-day area with no disturbance inside it yet
 * (formation expected later from a system that doesn't exist yet). NHC's
 * outlook layers carry no invest number or name, so cards are labeled by
 * basin.
 */
export function buildOutlookSystems(disturbancePointsFC, disturbanceAreasFC) {
  const systems = [];
  const points = (disturbancePointsFC?.features ?? []).filter((f) => f.geometry?.type === 'Point');
  points.forEach((f) => {
    const [lng, lat] = f.geometry.coordinates;
    systems.push({ ...f.properties, kind: 'disturbance', lat, lng });
  });
  for (const area of disturbanceAreasFC?.features ?? []) {
    if (points.some((pt) => polygonContains(area.geometry, pt.geometry.coordinates))) continue;
    const center = ringAverage(area.geometry);
    if (!center) continue;
    systems.push({ ...area.properties, kind: 'area', lng: center[0], lat: center[1] });
  }
  systems.sort((a, b) => (CHANCE_RANK[b.formationChance] ?? 0) - (CHANCE_RANK[a.formationChance] ?? 0)
    || (b.day7Percent ?? 0) - (a.day7Percent ?? 0));
  const perBasin = {};
  return systems.map((s) => {
    const basin = s.basin || 'Tropical';
    perBasin[basin] = (perBasin[basin] ?? 0) + 1;
    return {
      ...s,
      name: `${basin} ${s.kind === 'area' ? 'area of interest' : 'disturbance'} ${perBasin[basin]}`,
    };
  });
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

// ─── Wind & surge hazards (opt-in layers) ─────────────────────────────────────

// Official colors, decoded from the service's own legend (MapServer/legend).
export const WIND_PROB_BANDS = [
  { value: '<5%', color: null },
  { value: '5-10%', color: '#267300' },
  { value: '10-20%', color: '#38a800' },
  { value: '20-30%', color: '#55ff00' },
  { value: '30-40%', color: '#e6e600' },
  { value: '40-50%', color: '#ffd37f' },
  { value: '50-60%', color: '#e69800' },
  { value: '60-70%', color: '#ffaa00' },
  { value: '70-80%', color: '#e60000' },
  { value: '80-90%', color: '#a83800' },
  { value: '>90%', color: '#a900e6' },
];
export const WIND_PROB_THRESHOLDS_KT = [34, 50, 64];

export const WIND_RADII_COLORS = { 34: '#ffd37f', 50: '#e69800', 64: '#ff0000' };

export const SURGE_LEGEND = [
  { label: 'Greater than 1 ft above ground', color: '#0070ff' },
  { label: 'Greater than 3 ft above ground', color: '#ffff00' },
  { label: 'Greater than 6 ft above ground', color: '#ffaa00' },
  { label: 'Greater than 9 ft above ground', color: '#ff5500' },
  { label: 'Leveed area', color: '#9c9c9c' },
];

const SIMPLIFY_DEG = 0.05;
const NOAA_NHC_SERVICE = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';

/**
 * Raster tiles of NHC's Potential Storm Surge Flooding for the given image
 * layers. Straight from NOAA (it serves CORS for images): the edge proxy only
 * forwards query parameters, not ArcGIS export ones.
 */
export function nhcSurgeTileUrl(imageLayerIds) {
  if (!imageLayerIds?.length) return null;
  const params = [
    'bbox={bbox-epsg-3857}', 'bboxSR=3857', 'imageSR=3857', 'size=256,256',
    `layers=show:${imageLayerIds.join(',')}`, 'format=png32', 'transparent=true', 'f=image',
  ];
  return `${NOAA_NHC_SERVICE}/export?${params.join('&')}`;
}

async function surgeImageLayerId(idMap, slot) {
  const footprint = idMap.get(`Footprint_Inun_${slot}`);
  const image = idMap.get(`Image_Inun_${slot}`);
  if (footprint == null || image == null) return null;
  try {
    const params = new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' });
    const data = await fetchWithCache(`${BASE}/${footprint}/query?${params}`, `nhc:${slot}:surge`, {}, 10 * 60 * 1000);
    return data?.count > 0 ? image : null;
  } catch {
    return null;
  }
}

function tagSlot(fc, slot, extra = () => ({})) {
  return fc.features.map((f) => ({ ...f, properties: { ...f.properties, slot, ...extra(f.properties || {}) } }));
}

/**
 * Wind and surge products for the opt-in hazard layers. Only what's asked for
 * is fetched. Never throws — anything that fails comes back empty.
 *
 * @param {{ slots: string[], probKt: 34|50|64|null, radii: boolean, arrival: boolean, surge: boolean }} want
 */
export async function fetchNhcWindHazards({ slots = [], probKt = null, radii = false, arrival = false, surge = false }) {
  const idMap = await getLayerIdMap();
  const query = (name, cacheKey, ttlMs) => {
    const id = idMap.get(name);
    return id == null ? Promise.resolve(EMPTY_FC) : queryLayer(id, cacheKey, ttlMs, null, { simplifyDeg: SIMPLIFY_DEG });
  };

  const [prob, radiiBySlot, arrivalBySlot, surgeIds] = await Promise.all([
    probKt ? query(`Probabilistic Winds ${probKt} kts`, `nhc:windprob:${probKt}`, 10 * 60 * 1000) : EMPTY_FC,
    radii ? Promise.all(slots.map((s) => query(`${s} Forecast Wind Radii`, `nhc:${s}:radii`, 10 * 60 * 1000))) : [],
    arrival ? Promise.all(slots.map((s) => query(`${s} Most Likely Arrival Time`, `nhc:${s}:arrival`, 10 * 60 * 1000))) : [],
    surge ? Promise.all(slots.map((s) => surgeImageLayerId(idMap, s))) : [],
  ]);

  return {
    windProbGeoJSON: {
      type: 'FeatureCollection',
      features: prob.features
        .filter((f) => f.properties?.percentage && f.properties.percentage !== '<5%')
        .map((f) => ({ ...f, properties: { ...f.properties, thresholdKt: probKt } })),
    },
    windRadiiGeoJSON: {
      type: 'FeatureCollection',
      features: radiiBySlot.flatMap((fc, i) => tagSlot(fc, slots[i], (p) => ({
        radiiKt: cleanNumber(p.radii),
        tau: cleanNumber(p.tau) ?? 0,
      }))),
    },
    arrivalGeoJSON: {
      type: 'FeatureCollection',
      features: arrivalBySlot.flatMap((fc, i) => tagSlot(fc, slots[i], (p) => ({ arrivalTime: p.arrival_time || '' }))),
    },
    surgeImageLayerIds: surgeIds.filter((id) => id != null),
  };
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
