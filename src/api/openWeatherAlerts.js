/**
 * openWeatherAlerts.js
 * OpenWeatherMap One Call API 3.0 – weather alerts for US regions.
 *
 * Queries representative coordinates across wildfire-prone US regions in
 * parallel, deduplicates by event+sender+start, and normalizes to the same
 * alert schema used by noaaWeather.js / useWeatherAlerts.js.
 *
 * Docs: https://openweathermap.org/api/one-call-3
 * Env:  VITE_OPENWEATHER_API_KEY
 */

import { getCached, setCached } from '../utils/dataCache';

const OW_BASE = 'https://api.openweathermap.org/data/3.0/onecall';
const TTL_MS  = 5 * 60 * 1000;

// Representative center coordinates for major US wildfire-prone regions.
// These are spread across the country to give broad alert coverage.
const US_REGIONS = [
  { lat: 47.5,  lon: -120.5 }, // Washington
  { lat: 44.0,  lon: -120.5 }, // Oregon
  { lat: 40.5,  lon: -122.0 }, // Northern California
  { lat: 37.3,  lon: -119.4 }, // Central California
  { lat: 34.0,  lon: -118.0 }, // Southern California
  { lat: 39.5,  lon: -116.0 }, // Nevada
  { lat: 34.5,  lon: -112.0 }, // Arizona
  { lat: 35.0,  lon: -106.5 }, // New Mexico
  { lat: 39.5,  lon: -111.5 }, // Utah
  { lat: 39.0,  lon: -105.5 }, // Colorado
  { lat: 46.5,  lon: -112.0 }, // Montana
  { lat: 43.5,  lon: -114.0 }, // Idaho
  { lat: 43.0,  lon: -107.5 }, // Wyoming
  { lat: 31.5,  lon: -99.0  }, // Texas
  { lat: 35.5,  lon: -96.0  }, // Oklahoma/Great Plains
];

/**
 * Map OpenWeather alert tags to a NWS-compatible severity string.
 * @param {string[]} tags
 * @returns {'Extreme'|'Severe'|'Moderate'|'Minor'|'Unknown'}
 */
function normalizeSeverity(tags) {
  if (!tags || tags.length === 0) return 'Unknown';
  const joined = tags.join(' ').toLowerCase();
  if (joined.includes('extreme'))  return 'Extreme';
  if (joined.includes('severe'))   return 'Severe';
  if (joined.includes('moderate')) return 'Moderate';
  return 'Minor';
}

/**
 * Fetch and normalize alerts for a single lat/lon coordinate.
 * Only `alerts` data is requested (current/minutely/hourly/daily excluded).
 * @param {number} lat
 * @param {number} lon
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
async function fetchRegionAlerts(lat, lon, apiKey) {
  const url =
    `${OW_BASE}?lat=${lat}&lon=${lon}&exclude=current,minutely,hourly,daily&appid=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeather ${res.status} at ${lat},${lon}`);
  const data = await res.json();

  return (data.alerts || []).map(a => ({
    // Stable ID: sender + event type + start timestamp
    id:          `ow:${a.sender_name}:${a.event}:${a.start}`,
    type:        a.event,
    severity:    normalizeSeverity(a.tags),
    urgency:     'Expected',
    certainty:   'Likely',
    affectedArea: a.sender_name,
    effective:   new Date(a.start * 1000).toISOString(),
    sent:        new Date(a.start * 1000).toISOString(),
    expires:     new Date(a.end   * 1000).toISOString(),
    description: a.description,
    headline:    a.event,
    senderName:  a.sender_name,
    tags:        a.tags || [],
    geometry:    null, // One Call API does not return polygon geometry
    source:      'OpenWeather',
  }));
}

/**
 * Fetch active weather alerts for all configured US regions.
 * Results are deduplicated by alert ID and cached for 5 minutes.
 * Returns an empty array (not an error) when the API key is missing.
 * @returns {Promise<Array>}
 */
export async function fetchOpenWeatherAlerts() {
  const cacheKey = 'openweather:alerts';
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.warn('[OpenWeather] VITE_OPENWEATHER_API_KEY not set — skipping');
    return [];
  }

  const results = await Promise.allSettled(
    US_REGIONS.map(r => fetchRegionAlerts(r.lat, r.lon, apiKey))
  );

  const seenIds = new Set();
  const alerts  = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const alert of result.value) {
      if (seenIds.has(alert.id)) continue;
      seenIds.add(alert.id);
      alerts.push(alert);
    }
  }

  setCached(cacheKey, alerts, TTL_MS);
  return alerts;
}
