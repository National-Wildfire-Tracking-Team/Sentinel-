/**
 * noaaWeather.js
 * NOAA Weather API – Public US government data, no API key required.
 *
 * Endpoints used:
 *   - Active alerts: https://api.weather.gov/alerts/active
 *   - Red Flag Warnings + Fire Weather Watches
 *
 * Docs: https://www.weather.gov/documentation/services-web-api
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_WEATHER_ALERTS } from '../data/mockData';

const NOAA_BASE = 'https://api.weather.gov';

/**
 * Fetch active fire-weather alerts (Red Flag Warnings + Fire Weather Watches).
 * @returns {Promise<Array>}  Normalized alert objects
 */
export async function fetchFireWeatherAlerts() {
  // NOAA requires separate `event` params for multiple event types
  const params = new URLSearchParams({
    status: 'actual',
    message_type: 'alert,update',
  });
  params.append('event', 'Red Flag Warning');
  params.append('event', 'Fire Weather Watch');

  const url = `${NOAA_BASE}/alerts/active?${params}`;
  const cacheKey = 'noaa:fire-alerts';

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
      id:          p.id || f.id,
      type:        p.event,
      headline:    p.headline,
      description: p.description,
      instruction: p.instruction,
      severity:    p.severity,
      urgency:     p.urgency,
      certainty:   p.certainty,
      onset:       p.onset,
      expires:     p.expires,
      senderName:  p.senderName,
      affectedArea: p.areaDesc,
      geometry:    f.geometry,
    };
  });
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
