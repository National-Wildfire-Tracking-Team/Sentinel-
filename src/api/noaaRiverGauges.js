/**
 * noaaRiverGauges.js
 * NOAA National Water Prediction Service (NWPS) API v1
 * Fetches river gauge stations, observations, and flood stage data.
 *
 * Docs: https://api.water.noaa.gov/nwps/v1/docs/
 * No API key required — public US government data.
 */

import { getCached, setCached } from '../utils/dataCache';

const NWPS_BASE = 'https://api.water.noaa.gov/nwps/v1';

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
};

/** Flood status display config */
export const FLOOD_STATUS = {
  major:    { label: 'Major Flood',    color: '#7c3aed', order: 0 },
  moderate: { label: 'Moderate Flood', color: '#dc2626', order: 1 },
  minor:    { label: 'Minor Flood',    color: '#f97316', order: 2 },
  action:   { label: 'Action Stage',   color: '#eab308', order: 3 },
  normal:   { label: 'Normal',         color: '#22c55e', order: 4 },
  unknown:  { label: 'Unknown',        color: '#6b7280', order: 5 },
};

/**
 * Fetch all gauges currently at or above action stage.
 * Uses the /gauges endpoint with status filter.
 */
export async function fetchFloodingGauges() {
  const cacheKey = 'nwps:gauges:flooding';
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    // Fetch gauges at each elevated flood status in parallel
    const statuses = ['major', 'moderate', 'minor', 'action'];
    const results = await Promise.all(
      statuses.map(async (status) => {
        const url = `${NWPS_BASE}/gauges?status=${status}`;
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // The API returns { gauges: [...] } or directly an array
        return (data.gauges || data || []).map(g => ({ ...g, _queryStatus: status }));
      })
    );

    // Deduplicate by lid (a gauge may appear in multiple status buckets)
    const seen = new Set();
    const gauges = [];
    for (const batch of results) {
      for (const g of batch) {
        if (!seen.has(g.lid)) {
          seen.add(g.lid);
          gauges.push(normalizeGauge(g));
        }
      }
    }

    setCached(cacheKey, gauges, 5 * 60 * 1000); // 5 min
    return gauges;
  } catch (err) {
    console.warn('[NWPS] Failed to fetch flooding gauges:', err.message);
    return [];
  }
}

/**
 * Fetch ALL gauges nationwide (for map layer).
 * Filters to only those with known location and at action+.
 */
export async function fetchAllGauges() {
  const cacheKey = 'nwps:gauges:all';
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const url = `${NWPS_BASE}/gauges`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw = data.gauges || data || [];
    const gauges = raw.map(normalizeGauge).filter(g => g.latitude && g.longitude);
    setCached(cacheKey, gauges, 10 * 60 * 1000); // 10 min
    return gauges;
  } catch (err) {
    console.warn('[NWPS] Failed to fetch gauges:', err.message);
    return [];
  }
}

/**
 * Fetch detailed observations and forecast for a specific gauge.
 * Returns stage time series for the water level chart.
 */
export async function fetchGaugeDetail(lid) {
  const cacheKey = `nwps:gauge:${lid}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const [gaugeRes, stageRes] = await Promise.all([
      fetch(`${NWPS_BASE}/gauges/${lid}`, { headers: HEADERS }),
      fetch(`${NWPS_BASE}/gauges/${lid}/stageflow`, { headers: HEADERS }),
    ]);

    const gauge = gaugeRes.ok ? await gaugeRes.json() : null;
    const stageData = stageRes.ok ? await stageRes.json() : null;

    const result = {
      gauge: gauge ? normalizeGauge(gauge) : null,
      observed: extractTimeSeries(stageData, 'observed'),
      forecast: extractTimeSeries(stageData, 'forecast'),
    };

    setCached(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch (err) {
    console.warn(`[NWPS] Failed to fetch gauge detail for ${lid}:`, err.message);
    return { gauge: null, observed: [], forecast: [] };
  }
}

/**
 * Normalize raw NOAA NWPS gauge object to a consistent shape.
 */
function normalizeGauge(raw) {
  // The API may return status as a string or as an object with observed.flood
  const statusRaw =
    raw.status?.observed?.flood ||
    raw.status?.flood ||
    raw._queryStatus ||
    raw.flood_status ||
    detectStatusFromObserved(raw);

  const floodStatus = normalizeStatus(statusRaw);

  return {
    lid:         raw.lid || raw.id || '',
    name:        raw.name || raw.gaugeLocation?.name || 'Unknown Gauge',
    latitude:    raw.latitude  ?? raw.gaugeLocation?.latitude  ?? null,
    longitude:   raw.longitude ?? raw.gaugeLocation?.longitude ?? null,
    state:       raw.state || raw.gaugeLocation?.state || '',
    county:      raw.county || raw.gaugeLocation?.county || '',
    hsa:         raw.hsa || '',   // Hydrologic Service Area (NWS office)
    rfc:         raw.rfc || '',   // River Forecast Center
    status:      floodStatus,
    // Current observed stage
    currentStage:    parseFloat(raw.observed?.primary) || parseFloat(raw.stage) || null,
    currentStageUnit: raw.observed?.primaryUnit || 'ft',
    // Observed timestamp
    observedTime: raw.observed?.timestamp || raw.observed_time || null,
    // Flood stage thresholds
    floodStages: {
      action:   parseFloat(raw.flood?.action)   ?? parseFloat(raw.action_stage)   ?? null,
      minor:    parseFloat(raw.flood?.minor)    ?? parseFloat(raw.minor_stage)    ?? null,
      moderate: parseFloat(raw.flood?.moderate) ?? parseFloat(raw.moderate_stage) ?? null,
      major:    parseFloat(raw.flood?.major)    ?? parseFloat(raw.major_stage)    ?? null,
    },
    // Forecast crest info
    forecastCrest:      parseFloat(raw.forecast?.crest?.primary) || null,
    forecastCrestTime:  raw.forecast?.crest?.timestamp || null,
    // Impacts/flood info text
    impacts: raw.impacts || [],
    // URL for the NOAA gauge page
    url: raw.url || `https://water.noaa.gov/gauges/${raw.lid || raw.id}`,
  };
}

/** Determine flood status from observed vs threshold stages */
function detectStatusFromObserved(raw) {
  const stage = parseFloat(raw.observed?.primary) || parseFloat(raw.stage);
  if (!stage) return 'unknown';
  const f = raw.flood || {};
  if (f.major    && stage >= parseFloat(f.major))    return 'major';
  if (f.moderate && stage >= parseFloat(f.moderate)) return 'moderate';
  if (f.minor    && stage >= parseFloat(f.minor))    return 'minor';
  if (f.action   && stage >= parseFloat(f.action))   return 'action';
  return 'normal';
}

function normalizeStatus(raw) {
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase().trim();
  if (s === 'major')    return 'major';
  if (s === 'moderate') return 'moderate';
  if (s === 'minor')    return 'minor';
  if (s === 'action')   return 'action';
  if (s === 'normal' || s === 'no_flooding' || s === 'low' || s === 'below') return 'normal';
  return 'unknown';
}

/** Pull observed or forecast time series from a /stageflow response */
function extractTimeSeries(data, key) {
  if (!data) return [];
  const series = data[key] || data.data?.[key] || [];
  return series
    .filter(pt => pt.stage != null || pt.primary != null || pt.value != null)
    .map(pt => ({
      time:  pt.timestamp || pt.validTime || pt.time || '',
      stage: parseFloat(pt.stage ?? pt.primary ?? pt.value),
    }))
    .filter(pt => Number.isFinite(pt.stage));
}

/**
 * Convert a gauge array to a GeoJSON FeatureCollection for map rendering.
 * Only includes gauges with valid coordinates.
 */
export function gaugesToGeoJSON(gauges) {
  return {
    type: 'FeatureCollection',
    features: gauges
      .filter(g => g.latitude != null && g.longitude != null)
      .map(g => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [g.longitude, g.latitude],
        },
        properties: {
          lid:          g.lid,
          name:         g.name,
          state:        g.state,
          status:       g.status,
          currentStage: g.currentStage,
          stageUnit:    g.currentStageUnit,
          actionStage:  g.floodStages.action,
          minorStage:   g.floodStages.minor,
          moderateStage: g.floodStages.moderate,
          majorStage:   g.floodStages.major,
          observedTime: g.observedTime,
        },
      })),
  };
}
