/**
 * CAL FIRE incident feed adapter.
 * Public JSON endpoint; no API key required.
 *
 * Browser requests to fire.ca.gov are blocked by CORS; we try (in order):
 *   1. Same-origin `/api/calfire-v1` — Netlify edge, Vite dev proxy, or Vercel rewrite
 *   2. Same-origin `/api/calfire` fallback
 *   3. Supabase edge function `calfire-proxy` (when configured)
 *   4. Direct v1 upstream
 *   5. Direct legacy GeoJSON upstream
 */

import { getCached, setCached } from '../utils/dataCache';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const CAL_FIRE_INCIDENTS_V1_BASE =
  'https://incidents.fire.ca.gov/api/v1/incidents';
export const CAL_FIRE_GEOJSON_LEGACY_BASE =
  'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList';
// Backward-compatible export used by older imports.
export const CAL_FIRE_GEOJSON_BASE = CAL_FIRE_GEOJSON_LEGACY_BASE;

const CACHE_TTL_MS = 5 * 60 * 1000;

function validateGeoJSON(data) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Unexpected CAL FIRE incident response');
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

function pickFirstValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'active', 'open'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'inactive', 'closed'].includes(normalized)) return false;
  }
  return null;
}

function isInactiveIncident(incident) {
  const activeValue = toBoolean(
    pickFirstValue(incident, ['IsActive', 'isActive', 'Active', 'active', 'IsIncidentActive'])
  );
  if (activeValue !== null) return !activeValue;

  const closedValue = toBoolean(
    pickFirstValue(incident, ['IsClosed', 'isClosed', 'Closed', 'closed', 'IsIncidentClosed'])
  );
  if (closedValue !== null) return closedValue;

  const status = String(
    pickFirstValue(incident, ['Status', 'status', 'IncidentStatus', 'incidentStatus']) || ''
  ).toLowerCase();
  if (status) {
    if (status.includes('active') || status.includes('new')) return false;
    if (
      status.includes('inactive') ||
      status.includes('closed') ||
      status.includes('contained') ||
      status.includes('controlled')
    ) {
      return true;
    }
  }

  const contained = toNumber(
    pickFirstValue(incident, ['PercentContained', 'percentContained', 'Containment'])
  );
  return contained !== null ? contained >= 100 : false;
}

function incidentsArrayToGeoJSON(incidents, { includeInactive = false } = {}) {
  const features = incidents
    .map((incident, index) => {
      if (!includeInactive && isInactiveIncident(incident)) return null;

      const lat = toNumber(
        pickFirstValue(incident, ['Latitude', 'latitude', 'lat', 'Y', 'y', 'PointLatitude'])
      );
      const lng = toNumber(
        pickFirstValue(incident, [
          'Longitude',
          'longitude',
          'lng',
          'lon',
          'X',
          'x',
          'PointLongitude',
        ])
      );
      if (lat === null || lng === null) return null;

      const acres = toNumber(
        pickFirstValue(incident, ['AcresBurned', 'acresBurned', 'Acres', 'acres'])
      );
      const containedRaw = toNumber(
        pickFirstValue(incident, ['PercentContained', 'percentContained', 'Containment'])
      );
      const contained =
        containedRaw === null
          ? 0
          : Math.max(0, Math.min(100, containedRaw > 0 && containedRaw <= 1 ? containedRaw * 100 : containedRaw));

      const started = pickFirstValue(incident, [
        'Started',
        'started',
        'StartedDateOnly',
        'startedDate',
        'StartDate',
        'DateStarted',
      ]);
      const updated = pickFirstValue(incident, ['Updated', 'updated', 'LastUpdated', 'ModifiedDate']);

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        properties: {
          UniqueId: String(
            pickFirstValue(incident, [
              'UniqueId',
              'uniqueId',
              'IncidentId',
              'incidentId',
              'Id',
              'id',
              'Uuid',
            ]) || `calfire-v1-${index}`
          ),
          Name: String(
            pickFirstValue(incident, ['Name', 'name', 'IncidentName', 'incidentName']) || 'Unknown Fire'
          ),
          County: String(pickFirstValue(incident, ['County', 'county', 'Counties']) || ''),
          Latitude: lat,
          Longitude: lng,
          AcresBurned: acres ?? 0,
          PercentContained: contained,
          Started: started,
          StartedDateOnly:
            pickFirstValue(incident, ['StartedDateOnly', 'startedDateOnly', 'StartDate', 'startDate']) || started,
          Updated: updated,
          Type: String(
            pickFirstValue(incident, ['Type', 'type', 'IncidentType', 'incidentType']) || 'Wildfire'
          ),
          Url: pickFirstValue(incident, ['Url', 'url', 'IncidentUrl', 'incidentUrl', 'Link']),
          Location: pickFirstValue(incident, ['Location', 'location', 'LocationDescription']),
          AdminUnit: pickFirstValue(incident, ['AdminUnit', 'adminUnit', 'Unit']),
        },
      };
    })
    .filter(Boolean);

  return {
    type: 'FeatureCollection',
    features,
  };
}

function coerceToGeoJSON(data, { includeInactive = false } = {}) {
  if (data?.error) {
    throw new Error(String(data.error));
  }

  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return data;
  }

  const incidents = Array.isArray(data)
    ? data
    : pickFirstValue(data, [
        'incidents',
        'Incidents',
        'data',
        'Data',
        'results',
        'Results',
        'items',
        'Items',
      ]);

  if (Array.isArray(incidents)) {
    return incidentsArrayToGeoJSON(incidents, { includeInactive });
  }

  throw new Error('Unsupported CAL FIRE incident payload format');
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.includeInactive=false]
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
export async function fetchCalFireGeoJsonList({ includeInactive = false } = {}) {
  const legacyParams = new URLSearchParams({
    inactive: includeInactive ? 'true' : 'false',
  });
  const q = legacyParams.toString();
  const directLegacyUrl = `${CAL_FIRE_GEOJSON_LEGACY_BASE}?${q}`;
  const directV1Url = `${CAL_FIRE_INCIDENTS_V1_BASE}?${new URLSearchParams({
    inactive: includeInactive ? 'true' : 'false',
    includeInactive: includeInactive ? 'true' : 'false',
  }).toString()}`;
  const v1ProxyQuery = new URLSearchParams({
    inactive: includeInactive ? 'true' : 'false',
    includeInactive: includeInactive ? 'true' : 'false',
  }).toString();
  const proxyQuery = new URLSearchParams({
    inactive: includeInactive ? 'true' : 'false',
    upstream: 'v1',
  }).toString();
  const cacheKey = `calfire:geojson:${includeInactive ? 'all' : 'active'}`;

  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  /** @type {Array<{ label: string, run: () => Promise<object> }>} */
  const attempts = [];

  if (typeof window !== 'undefined') {
    attempts.push({
      label: 'same-origin /api/calfire-v1',
      run: () => fetchJson(`/api/calfire-v1?${v1ProxyQuery}`),
    });

    attempts.push({
      label: 'same-origin /api/calfire',
      run: () => fetchJson(`/api/calfire?${proxyQuery}`),
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
    label: 'direct incidents.fire.ca.gov v1',
    run: () =>
      fetchJson(directV1Url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
          Referer: 'https://incidents.fire.ca.gov/',
        },
      }),
  });

  attempts.push({
    label: 'direct incidents.fire.ca.gov legacy',
    run: () =>
      fetchJson(directLegacyUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; SentinelWildfireTracker/1.0)',
          Referer: 'https://incidents.fire.ca.gov/',
        },
      }),
  });

  let lastErr = null;
  for (const { label, run } of attempts) {
    try {
      const raw = await run();
      const geojson = coerceToGeoJSON(raw, { includeInactive });
      validateGeoJSON(geojson);
      setCached(cacheKey, geojson, CACHE_TTL_MS);
      return geojson;
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
