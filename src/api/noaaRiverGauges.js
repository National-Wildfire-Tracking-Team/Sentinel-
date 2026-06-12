/**
 * noaaRiverGauges.js
 * NOAA National Water Prediction Service (NWPS) API v1
 * Fetches river gauge stations, current stage observations, and flood thresholds.
 *
 * Proxied through /api/nwps/* to handle CORS (api.water.noaa.gov has no CORS headers).
 * Docs: https://api.water.noaa.gov/nwps/v1/docs/
 */

import { getCached, setCached } from '../utils/dataCache';

// Use local proxy path so CORS is handled by the edge function / dev server
const NWPS = '/api/nwps';

/** Flood status display config — color and sort order */
export const FLOOD_STATUS = {
  major:    { label: 'Major Flood',    color: '#7c3aed', order: 0 },
  moderate: { label: 'Moderate Flood', color: '#dc2626', order: 1 },
  minor:    { label: 'Minor Flood',    color: '#f97316', order: 2 },
  action:   { label: 'Action Stage',   color: '#eab308', order: 3 },
  normal:   { label: 'Normal',         color: '#22c55e', order: 4 },
  unknown:  { label: 'Unknown',        color: '#6b7280', order: 5 },
};

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

/**
 * Fetch all gauges nationwide, then return only those at action stage or higher.
 * Results cached for 5 minutes.
 */
export async function fetchFloodingGauges() {
  const cacheKey = 'nwps:gauges:flooding';
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const data = await fetchJSON(`${NWPS}/gauges`);

    // Handle both { gauges: [...] } and bare array response shapes
    const raw = Array.isArray(data) ? data : (data.gauges ?? data.data ?? []);

    const FLOOD_STATUSES = new Set(['action', 'minor', 'moderate', 'major']);

    const gauges = raw
      .map(normalizeGauge)
      .filter(g =>
        g.latitude != null &&
        g.longitude != null &&
        FLOOD_STATUSES.has(g.status)
      );

    setCached(cacheKey, gauges, 5 * 60 * 1000);
    return gauges;
  } catch (err) {
    console.warn('[NWPS] fetchFloodingGauges failed:', err.message);
    return [];
  }
}

/**
 * Fetch detailed stage/flow time series for a single gauge (for the sparkline chart).
 */
export async function fetchGaugeDetail(lid) {
  const cacheKey = `nwps:detail:${lid}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  const results = { observed: [], forecast: [] };

  try {
    // Try /stageflow first; fall back to /observations if not found
    const data = await fetchJSON(`${NWPS}/gauges/${lid}/stageflow`);
    results.observed = extractTimeSeries(data, 'observed');
    results.forecast = extractTimeSeries(data, 'forecast');
  } catch {
    try {
      const data = await fetchJSON(`${NWPS}/gauges/${lid}/observations`);
      results.observed = extractTimeSeries(data, 'data');
    } catch {
      // No observations available
    }
  }

  setCached(cacheKey, results, 5 * 60 * 1000);
  return results;
}

/**
 * Normalize a raw NWPS gauge object to a consistent internal shape.
 * The NWPS API has evolved; this handles multiple known response variants.
 */
function normalizeGauge(raw) {
  // ── Coordinates ──────────────────────────────────────────────────────────
  const latitude  = raw.latitude  ?? raw.location?.latitude  ?? raw.lat ?? null;
  const longitude = raw.longitude ?? raw.location?.longitude ?? raw.lon ?? null;

  // ── Current observed stage ────────────────────────────────────────────────
  // NWPS v1 puts latest observation under status.observed or observed.primary
  const obs = raw.status?.observed ?? raw.observed ?? {};
  const currentStage =
    parseFloatSafe(obs.primary) ??
    parseFloatSafe(obs.stage)   ??
    parseFloatSafe(raw.stage)   ??
    null;
  const stageUnit = obs.primaryUnit ?? obs.unit ?? 'ft';
  const observedTime = obs.timestamp ?? obs.time ?? null;

  // ── Flood status ─────────────────────────────────────────────────────────
  // NWPS v1: status.flood  (string: "action" | "minor" | "moderate" | "major" | "no_flooding" | null)
  const rawStatus =
    raw.status?.flood ??
    raw.status?.current?.flood ??
    raw.floodStatus ??
    raw.flood_status ??
    inferStatus(currentStage, raw.flood ?? raw.floodStages ?? {});

  const status = normalizeStatus(rawStatus);

  // ── Flood stage thresholds ────────────────────────────────────────────────
  const ft = raw.flood ?? raw.floodStages ?? raw.stages ?? {};
  const floodStages = {
    action:   parseFloatSafe(ft.action   ?? ft.actionStage)   ?? null,
    minor:    parseFloatSafe(ft.minor    ?? ft.minorStage)    ?? null,
    moderate: parseFloatSafe(ft.moderate ?? ft.moderateStage) ?? null,
    major:    parseFloatSafe(ft.major    ?? ft.majorStage)    ?? null,
  };

  // ── Forecast crest ───────────────────────────────────────────────────────
  const fc = raw.forecast ?? raw.fcst ?? {};
  const forecastCrest     = parseFloatSafe(fc.crest?.primary ?? fc.crest?.stage ?? fc.maxStage) ?? null;
  const forecastCrestTime = fc.crest?.timestamp ?? fc.crestTimestamp ?? null;

  return {
    lid:           raw.lid ?? raw.id ?? raw.stationId ?? '',
    name:          raw.name ?? raw.stationName ?? raw.gaugeLocation?.name ?? 'Unknown Gauge',
    latitude,
    longitude,
    state:         raw.state ?? raw.gaugeLocation?.state ?? '',
    county:        raw.county ?? raw.gaugeLocation?.county ?? '',
    hsa:           raw.hsa ?? '',
    rfc:           raw.rfc ?? '',
    status,
    currentStage,
    currentStageUnit: stageUnit,
    observedTime,
    floodStages,
    forecastCrest,
    forecastCrestTime,
    impacts: Array.isArray(raw.impacts) ? raw.impacts : [],
    url: raw.url ?? `https://water.noaa.gov/gauges/${raw.lid ?? raw.id ?? ''}`,
  };
}

function parseFloatSafe(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function inferStatus(stage, thresholds) {
  if (stage == null) return null;
  if (thresholds.major    != null && stage >= parseFloat(thresholds.major))    return 'major';
  if (thresholds.moderate != null && stage >= parseFloat(thresholds.moderate)) return 'moderate';
  if (thresholds.minor    != null && stage >= parseFloat(thresholds.minor))    return 'minor';
  if (thresholds.action   != null && stage >= parseFloat(thresholds.action))   return 'action';
  return 'normal';
}

function normalizeStatus(raw) {
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase().trim();
  if (s === 'major')    return 'major';
  if (s === 'moderate') return 'moderate';
  if (s === 'minor')    return 'minor';
  if (s === 'action')   return 'action';
  if (s === 'normal' || s === 'no_flooding' || s === 'low' || s === 'none' || s === 'obs') return 'normal';
  return 'unknown';
}

function extractTimeSeries(data, key) {
  if (!data) return [];
  const series = data[key] ?? data.data?.[key] ?? data.data ?? [];
  if (!Array.isArray(series)) return [];
  return series
    .map(pt => ({
      time:  pt.timestamp ?? pt.validTime ?? pt.time ?? '',
      stage: parseFloatSafe(pt.primary ?? pt.stage ?? pt.value),
    }))
    .filter(pt => pt.stage != null);
}

/**
 * Convert a normalized gauge array to GeoJSON for map rendering.
 */
export function gaugesToGeoJSON(gauges) {
  return {
    type: 'FeatureCollection',
    features: gauges
      .filter(g => g.latitude != null && g.longitude != null)
      .map(g => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [g.longitude, g.latitude] },
        properties: {
          lid:           g.lid,
          name:          g.name,
          state:         g.state,
          status:        g.status,
          currentStage:  g.currentStage,
          stageUnit:     g.currentStageUnit,
          actionStage:   g.floodStages.action,
          minorStage:    g.floodStages.minor,
          moderateStage: g.floodStages.moderate,
          majorStage:    g.floodStages.major,
          observedTime:  g.observedTime,
        },
      })),
  };
}
