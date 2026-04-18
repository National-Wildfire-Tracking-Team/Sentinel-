/**
 * openSkyApi.js
 * Fetches live aircraft state vectors from the OpenSky Network API.
 *
 * Uses the Supabase edge function (opensky-proxy) when Supabase is configured
 * so that optional credentials stay server-side. Falls back to a direct
 * unauthenticated request when Supabase is not available.
 *
 * OpenSky state vector index reference:
 *   [0]  icao24          [1]  callsign        [2]  origin_country
 *   [3]  time_position   [4]  last_contact    [5]  longitude
 *   [6]  latitude        [7]  baro_altitude   [8]  on_ground
 *   [9]  velocity        [10] true_track      [11] vertical_rate
 *   [12] sensors         [13] geo_altitude    [14] squawk
 *   [15] spi             [16] position_source [17] category
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { acquireSlot, remaining } from '../utils/openSkyRateLimiter';

const OPENSKY_BASE = 'https://opensky-network.org/api';

const AIRCRAFT_CATEGORIES = {
  0:  'No information',
  1:  'No ADS-B emitter category',
  2:  'Light aircraft',
  3:  'Small aircraft',
  4:  'Large aircraft',
  5:  'High vortex large',
  6:  'Heavy aircraft',
  7:  'High performance',
  8:  'Rotorcraft',
  9:  'Glider / Sailplane',
  10: 'Lighter-than-air',
  11: 'Parachutist / Skydiver',
  12: 'Ultralight / Hang-glider',
  13: 'Reserved',
  14: 'Unmanned aerial vehicle',
  15: 'Space vehicle',
  16: 'Surface – Emergency',
  17: 'Surface – Service',
  18: 'Point obstacle',
  19: 'Cluster obstacle',
  20: 'Line obstacle',
};

function stateToProperties(s) {
  const category = s[17] != null ? (AIRCRAFT_CATEGORIES[s[17]] ?? String(s[17])) : null;
  return {
    icao24:        s[0] ?? '',
    callsign:      (s[1] ?? '').trim() || (s[0] ?? ''),
    origin_country: s[2] ?? '',
    baro_altitude: s[7],
    on_ground:     s[8],
    velocity:      s[9],
    true_track:    s[10] ?? 0,
    vertical_rate: s[11],
    squawk:        s[14] ?? '',
    category,
  };
}

function statesToGeoJSON(states) {
  if (!Array.isArray(states) || !states.length) {
    return { type: 'FeatureCollection', features: [] };
  }
  const features = states
    .filter(s => s[5] != null && s[6] != null && s[8] === false)
    .map(s => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [s[5], s[6]],
      },
      properties: stateToProperties(s),
    }));
  return { type: 'FeatureCollection', features };
}

/**
 * Fetch airborne state vectors within a bounding box.
 * @param {{ west, south, east, north }} bounds
 * @returns {Promise<GeoJSON.FeatureCollection>}
 */
export async function fetchFlights(bounds = { west: -130, south: 24, east: -65, north: 50 }) {
  if (remaining() === 0) {
    console.warn('[OpenSky] Hourly credit limit reached – skipping fetch');
    return { type: 'FeatureCollection', features: [] };
  }
  await acquireSlot();

  // Preferred: Supabase edge function keeps any credentials server-side
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.functions.invoke('opensky-proxy', {
        body: {
          lamin: bounds.south,
          lomin: bounds.west,
          lamax: bounds.north,
          lomax: bounds.east,
        },
      });
      if (error) throw new Error(error.message || 'Edge function error');
      const json = typeof data === 'string' ? JSON.parse(data) : data;
      return statesToGeoJSON(json?.states ?? []);
    } catch (err) {
      console.warn('[OpenSky] Supabase edge function failed, trying direct:', err.message);
    }
  }

  // Fallback: direct call (OpenSky supports CORS for public access)
  try {
    const params = new URLSearchParams({
      lamin: String(bounds.south),
      lomin: String(bounds.west),
      lamax: String(bounds.north),
      lomax: String(bounds.east),
    });
    const resp = await fetch(`${OPENSKY_BASE}/states/all?${params}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return statesToGeoJSON(json?.states ?? []);
  } catch (err) {
    console.error('[OpenSky] Direct fetch failed:', err.message);
    return { type: 'FeatureCollection', features: [] };
  }
}
