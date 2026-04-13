/**
 * openaq.js
 * OpenAQ v3 API – real-time air quality sensor data.
 * API docs: https://docs.openaq.org/
 *
 * Fetches monitoring stations within a given radius of map-center coordinates,
 * converts raw PM2.5 concentrations to EPA AQI values, and falls back to
 * AirNow data when the OpenAQ request fails.
 */

import { fetchWithCache } from '../utils/dataCache';
import { fetchAQIStations as fetchAirNowStations } from './airnow';

const OPENAQ_BASE = 'https://api.openaq.org/v3';
const API_KEY     = import.meta.env.VITE_OPENAQ_API_KEY;
const MAX_RADIUS  = 100_000; // OpenAQ supports up to ~100 km per request

// ─── EPA PM2.5 AQI breakpoints ────────────────────────────────────────────────
const PM25_BREAKPOINTS = [
  { cLo:   0.0, cHi:  12.0, aLo:   0, aHi:  50 },
  { cLo:  12.1, cHi:  35.4, aLo:  51, aHi: 100 },
  { cLo:  35.5, cHi:  55.4, aLo: 101, aHi: 150 },
  { cLo:  55.5, cHi: 150.4, aLo: 151, aHi: 200 },
  { cLo: 150.5, cHi: 250.4, aLo: 201, aHi: 300 },
  { cLo: 250.5, cHi: 350.4, aLo: 301, aHi: 400 },
  { cLo: 350.5, cHi: 500.4, aLo: 401, aHi: 500 },
];

/**
 * Convert a PM2.5 concentration (µg/m³) to an EPA AQI integer.
 * Uses the standard linear interpolation formula across breakpoints.
 */
export function pm25ToAQI(concentration) {
  if (concentration < 0) return 0;
  const bp = PM25_BREAKPOINTS.find(b => concentration >= b.cLo && concentration <= b.cHi);
  if (!bp) return concentration > 500.4 ? 500 : 0;
  return Math.round(
    ((bp.aHi - bp.aLo) / (bp.cHi - bp.cLo)) * (concentration - bp.cLo) + bp.aLo,
  );
}

function aqiToCategory(aqi) {
  if (aqi <= 50)  return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

// ─── Normalize OpenAQ v3 location records ─────────────────────────────────────

function normalizeLocations(locations) {
  const stations = [];
  for (const loc of locations) {
    const coords = loc.coordinates;
    if (!coords?.latitude || !coords?.longitude) continue;

    const pm25Sensor = loc.sensors?.find(s => s.parameter?.name === 'pm25');
    const pm10Sensor = loc.sensors?.find(s => s.parameter?.name === 'pm10');

    const pm25Val = pm25Sensor?.latest?.value ?? null;
    const pm10Val = pm10Sensor?.latest?.value  ?? null;

    // Skip stations that have no usable reading
    if (pm25Val === null && pm10Val === null) continue;

    // Prefer PM2.5 for AQI; fall back to a conservative PM10 estimate (×0.5)
    const aqi = pm25Val !== null
      ? pm25ToAQI(pm25Val)
      : Math.min(500, Math.round(pm10Val * 0.5));

    stations.push({
      id:            `openaq-${loc.id}`,
      latitude:      coords.latitude,
      longitude:     coords.longitude,
      aqi,
      category:      aqiToCategory(aqi),
      pm25:          pm25Val ?? 0,
      reportingArea: loc.locality ?? loc.name ?? 'Unknown',
    });
  }
  return stations;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch AQI stations from OpenAQ v3 for a given map center.
 *
 * @param {number} lat     Center latitude
 * @param {number} lon     Center longitude
 * @param {number} [radius=100000]  Search radius in meters (capped at 100 km)
 * @returns {Promise<Array>}  Normalized station objects
 */
export async function fetchOpenAQStations(lat, lon, radius = MAX_RADIUS) {
  if (!API_KEY) throw new Error('[OpenAQ] API key not configured (VITE_OPENAQ_API_KEY)');

  const params = new URLSearchParams({
    coordinates: `${lat},${lon}`,
    radius:      String(Math.min(radius, MAX_RADIUS)),
    limit:       '200',
  });

  const url      = `${OPENAQ_BASE}/locations?${params}`;
  const cacheKey = `openaq:${lat.toFixed(1)}:${lon.toFixed(1)}:${radius}`;

  const data = await fetchWithCache(
    url,
    cacheKey,
    { headers: { 'X-API-Key': API_KEY } },
    15 * 60 * 1000,
  );

  if (!Array.isArray(data?.results) || data.results.length === 0) {
    throw new Error('[OpenAQ] No stations returned for this area');
  }

  return normalizeLocations(data.results);
}

/**
 * Fetch AQI stations, preferring OpenAQ and falling back to AirNow.
 *
 * @param {number} lat  Map center latitude
 * @param {number} lon  Map center longitude
 * @returns {Promise<Array>}  Normalized AQI station objects
 */
export async function fetchAQIStations(lat, lon) {
  try {
    const stations = await fetchOpenAQStations(lat, lon);
    if (stations.length > 0) return stations;
    throw new Error('[OpenAQ] No stations after normalization');
  } catch (err) {
    console.warn('[OpenAQ] Falling back to AirNow:', err.message);
    return fetchAirNowStations();
  }
}
