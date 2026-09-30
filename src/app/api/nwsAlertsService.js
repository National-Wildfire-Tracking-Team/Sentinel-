/**
 * nwsAlertsService.js
 * Client for the nws-alerts Cloud Run service (cloud/nws-alerts).
 *
 * The service builds the same two lists this app otherwise builds itself —
 * normalized api.weather.gov alerts (fetchNWSAlerts in noaaWeather.js) and
 * the ID-first WWA MapServer supplement (nwsMapServerAlerts.js) — once per
 * 45 s for everyone, instead of once per tab per minute.
 *
 * Opt-in, like VITE_FIRE_MERGE_SERVICE_URL: only used when
 * VITE_NWS_ALERTS_SERVICE_URL is set. Every failure returns null, and the
 * caller falls back to the original Netlify path, so unsetting the variable
 * (or the service being down) can never cost an alert.
 */

export const NWS_ALERTS_SERVICE_URL = import.meta.env.VITE_NWS_ALERTS_SERVICE_URL || null;

// The /v1 contract this client understands — see cloud/nws-alerts/README.md.
const SCHEMA_VERSION = 1;

const TIMEOUT_MS = 10 * 1000;

/**
 * Validate a /v1/alerts body.
 *
 * A `stale: true` snapshot is rejected on purpose: the service only serves
 * one when its own upstream fetch just failed, and the Netlify path is an
 * independent route to api.weather.gov that may well still work.
 *
 * @returns {{ alerts: object[], supplemental: object[] } | null}
 */
export function parseServiceResponse(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.schemaVersion !== SCHEMA_VERSION) return null;
  if (body.stale) return null;
  if (!Array.isArray(body.alerts) || !Array.isArray(body.supplemental)) return null;
  // Same rule as fetchNWSAlerts(): an empty nationwide feed is a failure.
  if (body.alerts.length === 0) return null;
  return { alerts: body.alerts, supplemental: body.supplemental };
}

/**
 * Fetch the shared alert snapshot.
 *
 * The browser's HTTP cache revalidates with the service's ETag
 * (Cache-Control: max-age=0, must-revalidate), so an unchanged snapshot
 * costs a 304 rather than the full payload.
 *
 * @param {string} [baseUrl]
 * @returns {Promise<{ alerts: object[], supplemental: object[] } | null>}
 */
export async function fetchAlertsFromService(baseUrl = NWS_ALERTS_SERVICE_URL) {
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/alerts`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseServiceResponse(await res.json());
    if (!parsed) throw new Error('unusable response');
    return parsed;
  } catch (err) {
    console.warn('[WeatherAlerts] nws-alerts service unavailable, using Netlify path:', err?.message || err);
    return null;
  }
}
