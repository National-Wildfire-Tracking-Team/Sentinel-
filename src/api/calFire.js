/**
 * CAL FIRE incident GeoJSON (fire.ca.gov Umbraco IncidentApi).
 * Public JSON endpoint; no API key required.
 *
 * Browser requests to fire.ca.gov are blocked by CORS; we try (in order):
 *   1. Same-origin `/api/calfire` — Netlify edge, Vite dev proxy, or Vercel rewrite
 *   2. Supabase edge function `calfire-proxy` (when configured)
 *   3. Direct upstream (works server-side / Node only)
 */

import { getCached, setCached } from '../utils/dataCache';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const CAL_FIRE_GEOJSON_BASE =
  'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList';

const CACHE_TTL_MS = 5 * 60 * 1000;

function validateGeoJSON(data) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Unexpected CAL FIRE GeoJSON response');
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`Invalid JSON from ${url}`);
  }
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.includeInactive=false]
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
export async function fetchCalFireGeoJsonList({ includeInactive = false } = {}) {
  const params = new URLSearchParams({
    inactive: includeInactive ? 'true' : 'false',
  });
  const q = params.toString();
  const directUrl = `${CAL_FIRE_GEOJSON_BASE}?${q}`;
  const cacheKey = `calfire:geojson:${includeInactive ? 'all' : 'active'}`;

  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  /** @type {Array<{ label: string, run: () => Promise<object> }>} */
  const attempts = [];

  if (typeof window !== 'undefined') {
    attempts.push({
      label: 'same-origin /api/calfire',
      run: () => fetchJson(`/api/calfire?${q}`),
    });
  }

  if (typeof window !== 'undefined' && isSupabaseConfigured) {
    attempts.push({
      label: 'supabase calfire-proxy',
      run: async () => {
        const { data, error } = await supabase.functions.invoke('calfire-proxy', {
          body: { inactive: includeInactive },
        });
        if (error) throw new Error(error.message || 'Supabase invoke failed');
        if (!data) throw new Error('Empty Supabase response');
        return typeof data === 'object' ? data : JSON.parse(String(data));
      },
    });
  }

  attempts.push({
    label: 'direct incidents.fire.ca.gov',
    run: () => fetchJson(directUrl, { headers: { Accept: 'application/json' } }),
  });

  let lastErr = null;
  for (const { label, run } of attempts) {
    try {
      const data = await run();
      validateGeoJSON(data);
      setCached(cacheKey, data, CACHE_TTL_MS);
      return data;
    } catch (err) {
      lastErr = err;
      console.warn(`[CAL FIRE] ${label}:`, err.message);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('CAL FIRE GeoJSON unavailable');
}

/**
 * Normalize one CAL FIRE feature to the app's incident shape (aligned with IRWIN / inciweb).
 * @param {object} f GeoJSON feature
 * @param {number} index
 */
export function calFireFeatureToIncident(f, index) {
  const p = f.properties || {};
  const coords = f.geometry?.coordinates;
  const lng = Array.isArray(coords) ? coords[0] : Number(p.Longitude);
  const lat = Array.isArray(coords) ? coords[1] : Number(p.Latitude);

  const acres = Math.round(Number(p.AcresBurned) || 0);
  const contained = Number(p.PercentContained ?? 0) || 0;
  const startedRaw = p.Started || p.StartedDateOnly;
  const updatedRaw = p.Updated;

  return {
    id: p.UniqueId || `calfire-${index}`,
    name: p.Name || 'Unknown Fire',
    state: 'CA',
    county: p.County || '',
    lat,
    lng,
    acres,
    contained,
    started: startedRaw ? new Date(startedRaw).toISOString() : null,
    updated: updatedRaw ? new Date(updatedRaw).toISOString() : null,
    cause: p.Type === 'Wildfire' ? 'Wildfire' : (p.Type || 'Wildfire'),
    status: contained >= 100 ? 'controlled' : 'active',
    personnel: 0,
    structures_destroyed: 0,
    structures_damaged: 0,
    structures_threatened: 0,
    evacuation_orders: 0,
    evacuation_warnings: 0,
    air_tankers: 0,
    helicopters: 0,
    dozers: 0,
    engines: 0,
    incidentType: 'WF',
    source: 'CAL_FIRE',
    url: p.Url || null,
    location_description: p.Location || null,
    displayLabel: p.AdminUnit ? `${p.Name} (${p.AdminUnit})` : null,
    orgType: p.AdminUnit || null,
    updates: [],
  };
}

/**
 * @param {object} geojson CAL FIRE FeatureCollection
 * @returns {Array<object>} Normalized incidents (wildfires only)
 */
export function normalizeCalFireIncidents(geojson) {
  if (!geojson?.features?.length) return [];
  return geojson.features
    .filter(f => {
      const t = (f.properties?.Type || '').toLowerCase();
      return !t || t === 'wildfire';
    })
    .map((f, i) => calFireFeatureToIncident(f, i));
}
