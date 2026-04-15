/**
 * noaaWeather.js
 * NOAA Weather API – Public US government data, no API key required.
 *
 * Endpoints used:
 * - Active alerts: https://api.weather.gov/alerts/active
 * - Fetches ALL active weather alerts
 *
 * Docs: https://www.weather.gov/documentation/services-web-api
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_WEATHER_ALERTS } from '../data/mockData';

const NOAA_BASE = 'https://api.weather.gov';

// Zone geometry cache — persists for the app's lifetime since zone boundaries
// change rarely. Keyed by UGC code (e.g. "CAZ006"), value is a GeoJSON geometry.
const zoneGeometryCache = new Map();

/**
 * Batch-fetch zone geometries from the NWS /zones endpoint.
 * Splits codes into forecast vs. county types and fetches in chunks of 50.
 * Results are stored in zoneGeometryCache.
 * @param {string[]} codes  Array of UGC codes to fetch
 */
async function fetchZoneGeometryBatch(codes) {
  if (codes.length === 0) return;

  // UGC position 2 is the zone type:
  //   'Z' = NWS forecast zone  → query with type=forecast
  //   'C' = county             → query with type=county
  //   'F' = fire weather zone  → query with type=fire
  // Any other character is tried as 'forecast' as a best-effort fallback.
  const forecastCodes = codes.filter(c => c[2] === 'Z');
  const countyCodes   = codes.filter(c => c[2] === 'C');
  const fireCodes     = codes.filter(c => c[2] === 'F');
  const otherCodes    = codes.filter(c => c[2] !== 'Z' && c[2] !== 'C' && c[2] !== 'F');

  const CHUNK = 50;

  const fetchBatch = async (batch, type) => {
    const url = `${NOAA_BASE}/zones?id=${batch.join(',')}&type=${type}&include_geometry=true`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
          Accept: 'application/geo+json',
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const feature of (data.features || [])) {
        const id = feature.properties?.id;
        if (id && feature.geometry) {
          zoneGeometryCache.set(id, feature.geometry);
        }
      }
    } catch {
      // Silently ignore errors for individual batches
    }
  };

  const tasks = [];
  for (let i = 0; i < forecastCodes.length; i += CHUNK) {
    tasks.push(fetchBatch(forecastCodes.slice(i, i + CHUNK), 'forecast'));
  }
  for (let i = 0; i < countyCodes.length; i += CHUNK) {
    tasks.push(fetchBatch(countyCodes.slice(i, i + CHUNK), 'county'));
  }
  for (let i = 0; i < fireCodes.length; i += CHUNK) {
    tasks.push(fetchBatch(fireCodes.slice(i, i + CHUNK), 'fire'));
  }
  for (let i = 0; i < otherCodes.length; i += CHUNK) {
    tasks.push(fetchBatch(otherCodes.slice(i, i + CHUNK), 'forecast'));
  }
  await Promise.all(tasks);
}

/**
 * Enrich alerts that lack a direct geometry by fetching NWS zone boundaries
 * for their UGC zone codes. Alerts that already have geometry are passed through
 * unchanged. Zone polygons for a single alert are merged into a MultiPolygon.
 * @param {Array} alerts  Normalized alert objects from normalizeAlerts()
 * @returns {Promise<Array>}  Alerts with geometry filled in where possible
 */
export async function enrichAlertsWithGeometry(alerts) {
  const noGeo = alerts.filter(a => !a.geometry);
  if (noGeo.length === 0) return alerts;

  // Collect UGC codes that aren't already cached
  const needed = new Set();
  for (const alert of noGeo) {
    for (const code of (alert.geocode?.UGC || [])) {
      if (!zoneGeometryCache.has(code)) needed.add(code);
    }
  }

  if (needed.size > 0) {
    await fetchZoneGeometryBatch([...needed]);
  }

  return alerts.map(alert => {
    if (alert.geometry) return alert;

    const polygons = [];
    for (const code of (alert.geocode?.UGC || [])) {
      const geom = zoneGeometryCache.get(code);
      if (!geom) continue;
      if (geom.type === 'Polygon')      polygons.push(geom.coordinates);
      else if (geom.type === 'MultiPolygon') polygons.push(...geom.coordinates);
    }

    if (polygons.length === 0) return alert; // Still no geometry — skip on map
    return {
      ...alert,
      geometry: { type: 'MultiPolygon', coordinates: polygons },
    };
  });
}

/**
 * Fetch all active weather alerts.
 * Kept named fetchFireWeatherAlerts for backwards compatibility with hooks.
 * @returns {Promise<Array>}  Normalized alert objects
 */
export async function fetchFireWeatherAlerts() {
  const params = new URLSearchParams({
    status: 'actual',
    message_type: 'alert,update',
  });

  const url = `${NOAA_BASE}/alerts/active?${params}`;
  const cacheKey = 'noaa:all-alerts';

  try {
    const data = await fetchWithCache(url, cacheKey, {
      headers: {
        'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
        Accept: 'application/geo+json',
      },
    }, 5 * 60 * 1000);

    if (!data?.features?.length) throw new Error('No active alerts');
    return normalizeAlerts(data.features);
  } catch (err) {
    console.warn('[NOAA] Using mock alert data:', err.message);
    return MOCK_WEATHER_ALERTS;
  }
}

function normalizeAlerts(features) {
  return features.map(f => {
    const p = f.properties;
    return {
      id:           p.id || f.id,
      type:         p.event,
      headline:     p.headline,
      description:  p.description,
      instruction:  p.instruction,
      severity:     p.severity,
      urgency:      p.urgency,
      certainty:    p.certainty,
      sent:         p.sent,
      effective:    p.effective,
      onset:        p.onset,
      expires:      p.expires,
      senderName:   p.senderName,
      affectedArea: p.areaDesc,
      geocode:      p.geocode,      // { UGC: [...], SAME: [...] }
      parameters:   p.parameters,  // { VTEC: [...], WMOidentifier: [...], ... }
      geometry:     f.geometry,
    };
  });
}

/**
 * Fetch active weather alerts for a specific lat/lng point.
 * Uses the NOAA /alerts/active endpoint with the point parameter.
 * @param {number} lat  Latitude
 * @param {number} lng  Longitude
 * @returns {Promise<Array>}  Normalized alert objects for that location
 */
export async function fetchAlertsByPoint(lat, lng) {
  const url = `${NOAA_BASE}/alerts/active?point=${lat},${lng}&status=actual&message_type=alert,update`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
      Accept: 'application/geo+json',
    },
  });

  if (!res.ok) throw new Error(`NOAA API error: ${res.status}`);
  const data = await res.json();

  if (!data?.features?.length) return [];
  return normalizeAlerts(data.features);
}

/**
 * Convert alert array to a GeoJSON FeatureCollection for map rendering.
 * Alerts without geometry are excluded.
 */
export function alertsToGeoJSON(alerts) {
  return {
    type: 'FeatureCollection',
    features: alerts
      .filter(a => a.geometry)
      .map(a => ({
        type: 'Feature',
        geometry: a.geometry,
        properties: {
          id:       a.id,
          type:     a.type,
          headline: a.headline,
          severity: a.severity,
          expires:  a.expires,
        },
      })),
  };
}
