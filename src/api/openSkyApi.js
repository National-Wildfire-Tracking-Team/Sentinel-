/**
 * openSkyApi.js
 * Calls the opensky-proxy Supabase edge function which:
 *   - reads credentials from Supabase Vault secrets (OPENSKY_USERNAME / OPENSKY_PASSWORD)
 *   - enforces a global server-side rate limit of 166 requests / hour
 *   - upserts fresh aircraft positions into the aircraft_positions table
 *
 * The hook (useFlightData) reads from that table directly; this module is
 * only responsible for triggering the edge-function fetch.
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

/**
 * Triggers the opensky-proxy edge function to fetch fresh aircraft data and
 * store it in the aircraft_positions table.  Applies the client-side credit
 * budget before calling; the edge function applies the server-side budget.
 *
 * @param {{ west, south, east, north }} bounds
 * @returns {Promise<void>}
 */
export async function triggerFlightFetch(
  bounds = { west: -130, south: 24, east: -65, north: 50 },
) {
  if (remaining() === 0) {
    console.warn('[OpenSky] Client hourly credit limit reached – skipping fetch');
    return;
  }
  await acquireSlot();

  if (!isSupabaseConfigured) {
    console.warn('[OpenSky] Supabase not configured – cannot trigger edge function fetch');
    return;
  }

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

    if (json?.rate_limited) {
      console.info(
        `[OpenSky] Server-side rate limit reached ` +
        `(${json.credits_used ?? '?'} / 166 credits used this hour). ` +
        `Displaying cached positions from Supabase table.`,
      );
    } else if (json?.credits_remaining != null) {
      console.debug(
        `[OpenSky] Fetch OK – ${json.credits_remaining} server credits remaining this hour.`,
      );
    }
  } catch (err) {
    console.warn('[OpenSky] Edge function call failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Legacy export kept for any call-sites that imported fetchFlights directly.
// It now delegates to triggerFlightFetch and always returns an empty GeoJSON
// because the real data flows through the Supabase table → useFlightData hook.
// ---------------------------------------------------------------------------
export async function fetchFlights(bounds) {
  await triggerFlightFetch(bounds);
  return { type: 'FeatureCollection', features: [] };
}
