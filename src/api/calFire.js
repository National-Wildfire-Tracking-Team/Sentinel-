/**
 * CAL FIRE incident GeoJSON (fire.ca.gov Umbraco IncidentApi).
 * Public JSON endpoint; no API key required.
 *
 * GeoJsonList returns Point features with wildfire metadata for California incidents.
 */

import { fetchWithCache } from '../utils/dataCache';

export const CAL_FIRE_GEOJSON_BASE =
  'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList';

/**
 * @param {object} [opts]
 * @param {boolean} [opts.includeInactive=false]  When true, request inactive (final) incidents too.
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
export async function fetchCalFireGeoJsonList({ includeInactive = false } = {}) {
  const params = new URLSearchParams({
    inactive: includeInactive ? 'true' : 'false',
  });
  const url = `${CAL_FIRE_GEOJSON_BASE}?${params}`;
  const cacheKey = `calfire:geojson:${includeInactive ? 'all' : 'active'}`;

  const data = await fetchWithCache(url, cacheKey, {}, 5 * 60 * 1000);
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Unexpected CAL FIRE GeoJSON response');
  }
  return data;
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
