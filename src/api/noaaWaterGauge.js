/**
 * noaaWaterGauge.js
 * River/coastal gauge data, pulled from two independent NOAA systems – both
 * public, no key required:
 *
 *  - ArcGIS "Observed River Stages" MapServer (mapservices.weather.noaa.gov) –
 *    primary source for the map overlay's gauge list. See fetchArcgisRiverGauges.
 *  - NWPS – National Water Prediction Service (api.water.noaa.gov):
 *      GET /gauges                          – river/coastal gauges within a bbox
 *                                              (fallback list source only — see
 *                                              fetchArcgisRiverGauges for why)
 *      GET /gauges/{lid}                    – single gauge metadata + flood thresholds
 *      GET /gauges/{lid}/stageflow/observed – observed stage/flow time-series
 *      GET /gauges/{lid}/stageflow/forecast – forecast stage/flow time-series
 *    Docs: https://api.water.noaa.gov/nwps/v1/docs/
 *
 * Real NWPS response shapes (verified against the live API):
 *   gauge.status.observed.primary         → number (feet), NOT { value }
 *   gauge.status.observed.floodCategory   → 'no_flooding' | 'action' | 'minor' | 'moderate' | 'major'
 *   gauge.flood.categories.{cat}.stage    → number (feet) threshold, NOT flood.{cat}
 *   gauge.state                           → { abbreviation, name } object, NOT a string
 * The parsers below primarily target this shape but keep fallbacks for the
 * flatter shapes so they degrade gracefully if the API changes.
 */

import { getCached, setCached } from '../utils/dataCache';

// Requests are routed through /api/nwps to avoid CORS issues (Vite proxy in
// dev, Netlify edge function in production).
const BASE = '/api/nwps';

const HEADERS = { Accept: 'application/json' };

const CACHE_TTL = 5 * 60 * 1000;

// api.water.noaa.gov's /gauges list endpoint has been observed to hang
// server-side (connection stays open, no response) rather than erroring —
// plain fetch() has no default timeout, so without this an unhealthy upstream
// leaves the request pending indefinitely and the map just looks empty with
// no error ever surfacing. Single-resource endpoints (/gauges/{lid}) are
// unaffected, so this only needs to guard against the slow list endpoint,
// but is applied to all requests here for consistency.
const FETCH_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`NWPS request timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Bounding box covering CONUS, Alaska (incl. Aleutians), Hawaii and the
// Pacific/Caribbean territories. NWPS only serves US gauges, so an all-
// encompassing box returns every gauge "across the US".
const US_BBOX = { xmin: -179.99, ymin: -15, xmax: 179.99, ymax: 72 };

// ─── Value coercion helpers ─────────────────────────────────────────────────

/** Coerce a possibly-nested numeric value to a finite Number or null. */
function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  if (typeof v === 'object') {
    const inner = v.value ?? v.stage ?? null;
    return inner != null && Number.isFinite(Number(inner)) ? Number(inner) : null;
  }
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

/** Coerce a possibly-object field (e.g. state { abbreviation, name }) to a string or null. */
function toStr(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v.abbreviation ?? v.name ?? null;
  return String(v);
}

/** Extract the current observed stage (feet) from a gauge object. */
function extractStage(g) {
  return (
    toNum(g?.status?.observed?.primary) ??
    toNum(g?.status?.current?.primaryStage) ??
    toNum(g?.observed?.primary) ??
    toNum(g?.currentStage)
  );
}

/**
 * Extract the four flood-stage thresholds (feet).
 * Real shape: flood.categories.{cat}.stage; fallbacks: flood.stages.{cat}, flood.{cat}.
 */
function extractThresholds(flood) {
  const f = flood ?? {};
  const cats = f.categories ?? {};
  const flat = f.stages ?? f;
  const pick = (k) => toNum(cats?.[k]?.stage) ?? toNum(cats?.[k]) ?? toNum(flat?.[k]);
  return {
    action: pick('action'),
    minor: pick('minor'),
    moderate: pick('moderate'),
    major: pick('major'),
  };
}

/** Normalise an API flood-category string to our canonical lowercase keys. */
function normalizeCategory(cat) {
  if (!cat) return null;
  const c = String(cat).toLowerCase().replace(/\s+/g, '_');
  if (c.includes('major')) return 'major';
  if (c.includes('moderate')) return 'moderate';
  if (c.includes('minor')) return 'minor';
  if (c.includes('action')) return 'action';
  if (c.includes('no_flood') || c === 'none' || c === 'normal') return 'no_flooding';
  return c; // e.g. out_of_service, not_defined – rendered as default colour
}

/**
 * Single source of truth for flood-category label/color across the map layer,
 * hover popup, and detail panel, so they can't drift out of sync with each other.
 *   mapColor   – MapLibre circle color (hex)
 *   chartColor – SVG threshold-line color in the detail panel chart (hex)
 *   textClass  – Tailwind text color for badges/labels
 *   bgClass    – Tailwind background color for pills/badges
 */
export const FLOOD_CATEGORY_META = {
  major:       { label: 'Major Flooding',       mapColor: '#cc33ff', chartColor: '#9333ea', textClass: 'text-purple-400', bgClass: 'bg-purple-600' },
  moderate:    { label: 'Moderate Flooding',    mapColor: '#ff0000', chartColor: '#dc2626', textClass: 'text-red-400',    bgClass: 'bg-red-600' },
  minor:       { label: 'Minor Flooding',       mapColor: '#ff8c00', chartColor: '#f97316', textClass: 'text-orange-400', bgClass: 'bg-orange-500' },
  action:      { label: 'Action Stage',         mapColor: '#ffff00', chartColor: '#f59e0b', textClass: 'text-yellow-300', bgClass: 'bg-yellow-500' },
  no_flooding: { label: 'Normal / No Flooding', mapColor: '#1e90ff', chartColor: null,       textClass: 'text-blue-400',  bgClass: 'bg-blue-500' },
};

export const FLOOD_CATEGORY_DEFAULT = 'no_flooding';

/** Human-readable label for a flood category, falling back to 'No Data' for unknown/missing categories. */
export function floodCategoryLabel(category) {
  return FLOOD_CATEGORY_META[category]?.label ?? 'No Data';
}

/** Derive a flood category from a stage reading + thresholds (fallback when the API omits it). */
export function categoryForStage(stage, thresholds) {
  if (stage == null) return null;
  const t = thresholds ?? {};
  if (t.major != null && stage >= t.major) return 'major';
  if (t.moderate != null && stage >= t.moderate) return 'moderate';
  if (t.minor != null && stage >= t.minor) return 'minor';
  if (t.action != null && stage >= t.action) return 'action';
  return 'no_flooding';
}

// ─── GeoJSON conversion (map overlay) ───────────────────────────────────────

/** Convert the NWPS gauge list response into a GeoJSON FeatureCollection. */
export function gaugesToGeoJSON(gauges) {
  const features = [];
  for (const g of gauges) {
    // Handle coordinates from direct properties or nested geometry
    const lat = g.latitude ?? g.lat ?? g.geometry?.coordinates?.[1];
    const lon = g.longitude ?? g.lon ?? g.lng ?? g.geometry?.coordinates?.[0];
    if (lat == null || lon == null) continue;

    const stage = extractStage(g);
    const thresholds = extractThresholds(g.flood);
    const floodCategory =
      normalizeCategory(g.status?.observed?.floodCategory ?? g.floodCategory) ??
      categoryForStage(stage, thresholds) ??
      'no_flooding';

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(lon), Number(lat)] },
      properties: {
        lid: g.lid,
        name: g.name,
        state: toStr(g.state),
        county: toStr(g.county),
        hsa: toStr(g.hsa) ?? toStr(g.wfo),
        datum: toStr(g.datum) ?? toStr(g.verticalDatum),
        currentStage: stage,
        floodCategory,
        actionStage: thresholds.action,
        minorStage: thresholds.minor,
        moderateStage: thresholds.moderate,
        majorStage: thresholds.major,
        url: g.url ?? null,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Pull the array of gauges out of the various response envelopes the API may use. */
function extractGaugeList(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.gauges)) return json.gauges;
  if (Array.isArray(json?.data)) return json.data;
  if (json?.type === 'FeatureCollection' && Array.isArray(json.features)) {
    // Some NWPS endpoints return GeoJSON directly; flatten properties + geometry
    return json.features.map((f) => ({
      ...f.properties,
      latitude: f.geometry?.coordinates?.[1],
      longitude: f.geometry?.coordinates?.[0],
    }));
  }
  return [];
}

// ─── Primary gauge-list source: NOAA ArcGIS "Observed River Stages" ────────
//
// api.water.noaa.gov's own /gauges list endpoint has been observed to hang
// indefinitely server-side (connection opens, nothing is ever returned)
// regardless of bounding box size, even though its per-gauge endpoints
// (/gauges/{lid}, .../stageflow) respond normally. mapservices.weather.noaa.gov
// hosts a separate ArcGIS MapServer with the same observed-stage data that
// responds in well under a second, so it's used as the primary list source;
// NWPS's own list endpoint is kept as a fallback below in case roles ever
// reverse. Source: https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer

const ARCGIS_BASE = '/api/river-gauges';
const ARCGIS_PAGE_SIZE = 10000; // the service's own per-query cap
const ARCGIS_MAX_PAGES = 6; // guards against runaway pagination (~12.8k gauges today)

/** Convert one ArcGIS river-gauge feature into our canonical GeoJSON feature shape. */
function arcgisFeatureToFeature(feature) {
  const p = feature?.properties ?? {};
  const [lon, lat] = feature?.geometry?.coordinates ?? [null, null];
  if (lat == null || lon == null) return null;

  const stage = toNum(p.observed);
  const thresholds = {
    action: toNum(p.action),
    minor: toNum(p.flood), // ArcGIS "Flood Hazard Value" = the minor flood stage
    moderate: toNum(p.moderate),
    major: toNum(p.major),
  };
  const floodCategory = normalizeCategory(p.status) ?? categoryForStage(stage, thresholds) ?? 'no_flooding';

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(lon), Number(lat)] },
    properties: {
      lid: p.gaugelid ?? null,
      name: p.location || p.waterbody || p.gaugelid || null,
      state: p.state || null,
      county: null,
      hsa: p.wfo || null,
      datum: p.hdatum || null,
      currentStage: stage,
      floodCategory,
      actionStage: thresholds.action,
      minorStage: thresholds.minor,
      moderateStage: thresholds.moderate,
      majorStage: thresholds.major,
      url: p.url || null,
    },
  };
}

/** Fetch every gauge from the ArcGIS list source, paginating past its 10k-record cap. */
async function fetchArcgisRiverGauges() {
  const features = [];
  for (let page = 0; page < ARCGIS_MAX_PAGES; page++) {
    const offset = page * ARCGIS_PAGE_SIZE;
    const url = `${ARCGIS_BASE}?resultRecordCount=${ARCGIS_PAGE_SIZE}&resultOffset=${offset}`;
    const res = await fetchWithTimeout(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`River gauges HTTP ${res.status}`);
    const json = await res.json();
    const pageFeatures = Array.isArray(json?.features) ? json.features : [];
    features.push(...pageFeatures);
    if (pageFeatures.length < ARCGIS_PAGE_SIZE) break; // last page
  }
  return features.map(arcgisFeatureToFeature).filter(Boolean);
}

function gaugesUrl(useBbox) {
  if (!useBbox) return `${BASE}/gauges`;
  const params = new URLSearchParams({
    'bbox.xmin': String(US_BBOX.xmin),
    'bbox.ymin': String(US_BBOX.ymin),
    'bbox.xmax': String(US_BBOX.xmax),
    'bbox.ymax': String(US_BBOX.ymax),
    srid: 'EPSG_4326',
  });
  return `${BASE}/gauges?${params.toString()}`;
}

/**
 * Fetch all US gauges for the map overlay.
 *
 * Tries the ArcGIS "Observed River Stages" source first (fast, reliable —
 * see the comment above fetchArcgisRiverGauges). If that yields nothing,
 * falls back to NWPS's own list endpoint, trying an unfiltered request then
 * an all-US bbox, returning the first attempt that yields gauges and only
 * throwing if every attempt errors.
 *
 * A successful, non-empty result is cached for 5 minutes. Empty results are
 * never cached: a transient empty/failed response must not blank the map for
 * the full TTL after the upstream API recovers.
 */
export async function fetchWaterGauges() {
  const cacheKey = 'noaa-water-gauges-all';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  let features = [];
  let lastError = null;

  try {
    features = await fetchArcgisRiverGauges();
  } catch (err) {
    lastError = err;
  }

  if (!features.length) {
    const attempts = [gaugesUrl(false), gaugesUrl(true)];
    for (const url of attempts) {
      try {
        const res = await fetchWithTimeout(url, { headers: HEADERS });
        if (!res.ok) {
          lastError = new Error(`NWPS gauges HTTP ${res.status}`);
          continue;
        }
        const parsed = extractGaugeList(await res.json());
        if (parsed.length) {
          features = gaugesToGeoJSON(parsed).features;
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  // Surface a hard failure so the UI shows an error instead of silently
  // pretending there are zero gauges (and re-fetches on the next interval).
  if (features.length === 0 && lastError) throw lastError;

  const geoJSON = { type: 'FeatureCollection', features };
  if (geoJSON.features.length > 0) setCached(cacheKey, geoJSON, CACHE_TTL);
  return geoJSON;
}

// ─── Single-gauge detail (side panel) ───────────────────────────────────────

/** Normalise flood impact statements to { stage, statement, category }. */
function normalizeImpacts(raw, thresholds) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((imp) => {
      const stage = toNum(imp.stage ?? imp.value ?? imp.elevation);
      const statement = imp.statement ?? imp.impact ?? imp.description ?? imp.text ?? '';
      const category =
        normalizeCategory(imp.category ?? imp.type) ?? categoryForStage(stage, thresholds);
      return { stage, statement: String(statement).trim(), category };
    })
    .filter((imp) => imp.statement)
    .sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0));
}

/**
 * Fetch detailed metadata for a single gauge and return a normalised object
 * with a stable shape the UI consumes directly. Cached per LID for 5 minutes.
 */
export async function fetchGaugeDetail(lid) {
  const cacheKey = `noaa-gauge-detail-${lid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetchWithTimeout(`${BASE}/gauges/${encodeURIComponent(lid)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`NWPS gauge detail HTTP ${res.status}`);

  const d = await res.json();

  const thresholds = extractThresholds(d.flood);
  const currentStage = extractStage(d);
  const floodCategory =
    normalizeCategory(d.status?.observed?.floodCategory ?? d.floodCategory) ??
    categoryForStage(currentStage, thresholds) ??
    'no_flooding';

  const normalized = {
    lid: d.lid ?? lid,
    name: d.name ?? null,
    state: toStr(d.state),
    county: toStr(d.county),
    hsa: toStr(d.hsa) ?? toStr(d.wfo),
    datum: toStr(d.datum) ?? toStr(d.verticalDatum),
    currentStage,
    floodCategory,
    thresholds,
    impacts: normalizeImpacts(d.flood?.impacts ?? d.impacts, thresholds),
  };

  setCached(cacheKey, normalized, CACHE_TTL);
  return normalized;
}

// ─── Stage/flow time-series (chart) ─────────────────────────────────────────

function parseSeriesPoints(payload) {
  const arr = payload?.data ?? payload?.observed?.data ?? payload?.forecast?.data ??
    (Array.isArray(payload) ? payload : []);
  return arr
    .map((pt) => ({
      time: new Date(pt.validTime ?? pt.time ?? pt.t).getTime(),
      stage: toNum(pt.primary ?? pt.stage),
    }))
    .filter((p) => p.stage != null && Number.isFinite(p.time));
}

/**
 * Fetch observed + forecast stage time-series for a gauge.
 * Uses the dedicated /observed and /forecast sub-endpoints (a missing one is
 * treated as an empty series rather than failing the whole request).
 * Returns { observed: [{time, stage}], forecast: [{time, stage}] }.
 * Cached per LID for 5 minutes.
 */
export async function fetchGaugeStageFlow(lid) {
  const cacheKey = `noaa-gauge-stageflow-${lid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const base = `${BASE}/gauges/${encodeURIComponent(lid)}/stageflow`;
  const load = async (path) => {
    try {
      const res = await fetchWithTimeout(`${base}/${path}`, { headers: HEADERS });
      if (!res.ok) return [];
      return parseSeriesPoints(await res.json());
    } catch {
      return [];
    }
  };

  const [observed, forecast] = await Promise.all([load('observed'), load('forecast')]);
  const result = { observed, forecast };

  // Don't negatively-cache an empty series (both sub-endpoints down).
  if (observed.length || forecast.length) setCached(cacheKey, result, CACHE_TTL);
  return result;
}
