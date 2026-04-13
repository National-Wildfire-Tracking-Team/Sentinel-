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
