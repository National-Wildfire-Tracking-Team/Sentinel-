/**
 * fema.js
 * FEMA IPAWS Open EAS Service – Integrated Public Alert and Warning System
 * Fetches active Emergency Alert System (EAS) messages.
 *
 * apps.fema.gov sends no CORS headers, so the browser can never call it
 * directly (see netlify/edge-functions/fema-proxy.js, registered at
 * /api/fema in netlify.toml). In dev, the same endpoint is reached via the
 * local poller (server/ipaws-server.js) proxied at /alerts (vite.config.js).
 * Both return { alerts: [{ identifier, sender, sent, status, msgType,
 * scope, infos: [{ headline, description, instruction, senderName, sent,
 * event, urgency, severity, certainty, expires, areas: [{ areaDesc,
 * polygon, circle, geometry }] }] }] }.
 */

import { getCached, setCached } from '../utils/dataCache';

const FEMA_URL = (
  import.meta.env.VITE_IPAWS_ALERTS_URL ?? (import.meta.env.DEV ? '/alerts' : '/api/fema')
).trim();

/**
 * Fetch active EAS alerts from the FEMA IPAWS Open service (via same-origin proxy).
 * Results are cached for 60 seconds.
 * Normalizes to the same shape as NOAA alerts so they can be merged directly.
 * @returns {Promise<Array>}  Normalized EAS alert objects
 */
export async function fetchFemaAlerts() {
  if (!FEMA_URL) return [];

  const cacheKey = 'fema:eas:feed';
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const res = await fetch(FEMA_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    const alerts = normalizeAlerts(data);
    setCached(cacheKey, alerts, 60 * 1000);
    return alerts;
  } catch (err) {
    console.warn('[FEMA] Failed to fetch EAS feed:', err.message);
    return [];
  }
}

/**
 * Normalize a single alert (as returned by the fema-proxy edge function) into
 * the same shape used by normalizeAlerts() in noaaWeather.js.
 * Shape in: { identifier, sender, sent, status, msgType, scope,
 *   infos: [{ headline, description, instruction, senderName, sent, event,
 *   urgency, severity, certainty, expires,
 *   areas: [{ areaDesc, polygon, circle, geometry }] }] }
 */
function normalizeCAPEntry(item) {
  const identifier = item.identifier || '';
  const sent       = item.sent || '';

  const infos = Array.isArray(item.infos) ? item.infos : [];
  const info = infos[0] || {};
  const areas = Array.isArray(info.areas) ? info.areas : [];

  // The proxy already parses polygon/circle into GeoJSON per area — union
  // multiple areas into a GeometryCollection when more than one has geometry.
  const geometries = areas.map(a => a.geometry).filter(Boolean);
  const geometry = geometries.length === 1
    ? geometries[0]
    : geometries.length > 1
      ? { type: 'GeometryCollection', geometries }
      : null;

  const affectedArea = areas.map(a => a.areaDesc).filter(Boolean).join('; ');

  return {
    id:          identifier,
    type:        info.event || item.msgType || '',
    headline:    info.headline || '',
    description: info.description || '',
    instruction: info.instruction || '',
    severity:    info.severity  || '',
    urgency:     info.urgency   || '',
    certainty:   info.certainty || '',
    sent,
    effective:   info.sent || sent,
    onset:       info.sent || sent,
    expires:     info.expires || '',
    senderName:  info.senderName || item.sender || '',
    affectedArea,
    geocode:     {},
    parameters:  {},
    geometry,
    source:      'fema',
  };
}

/**
 * Normalize the FEMA IPAWS proxy response.
 * @param {object|Array} data  Raw response from /api/fema (or /alerts in dev)
 * @returns {Array}  Normalized alert objects
 */
function normalizeAlerts(data) {
  const items = Array.isArray(data) ? data : data?.alerts ?? [];
  return items.map(normalizeCAPEntry).filter(a => a.id && a.type);
}
