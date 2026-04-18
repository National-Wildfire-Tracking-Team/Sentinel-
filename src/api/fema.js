/**
 * fema.js
 * FEMA IPAWS Open EAS Service – Integrated Public Alert and Warning System
 * Fetches active Emergency Alert System (EAS) messages.
 *
 * Endpoint: https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/feed
 *
 * No API key required – public government data service.
 * Response follows the CAP (Common Alerting Protocol) JSON structure.
 */

import { getCached, setCached } from '../utils/dataCache';

const FEMA_URL = 'https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/feed';

/**
 * Fetch active EAS alerts from the FEMA IPAWS Open service.
 * Results are cached for 60 seconds.
 * Normalizes to the same shape as NOAA alerts so they can be merged directly.
 * @returns {Promise<Array>}  Normalized EAS alert objects
 */
export async function fetchFemaAlerts() {
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
 * Parse a CAP polygon string ("lat,lng lat,lng ...") into a GeoJSON Polygon.
 * CAP uses lat,lng order; GeoJSON uses [lng, lat].
 * @param {string} polygonStr
 * @returns {object|null} GeoJSON Polygon or null if unparseable
 */
function parseCAPPolygon(polygonStr) {
  if (!polygonStr || typeof polygonStr !== 'string') return null;
  const coords = polygonStr.trim().split(/\s+/).map(pair => {
    const [lat, lng] = pair.split(',').map(Number);
    return isNaN(lat) || isNaN(lng) ? null : [lng, lat];
  }).filter(Boolean);
  if (coords.length < 4) return null;
  // Ensure ring is closed
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
  return { type: 'Polygon', coordinates: [coords] };
}

/**
 * Normalize a single CAP info block + parent identifier into the same shape
 * used by normalizeAlerts() in noaaWeather.js.
 */
function normalizeCAPEntry(item) {
  const identifier = item.identifier || item.id || '';
  const sent       = item.sent || '';

  // CAP puts alert content in an "info" array (one per language).
  // Pick English first, then fall back to the first available block.
  const infoList = Array.isArray(item.info) ? item.info
    : item.info ? [item.info]
    : [item]; // flat / legacy format

  const info = infoList.find(i => i.language?.toLowerCase().startsWith('en'))
    || infoList[0]
    || {};

  // Area block (first entry if array)
  const areaList = Array.isArray(info.area) ? info.area
    : info.area ? [info.area]
    : [];
  const area = areaList[0] || {};

  // Parse polygon geometry from CAP area
  let geometry = null;
  if (area.polygon) {
    geometry = parseCAPPolygon(area.polygon);
  }

  // Build UGC geocode map (mirrors NOAA { UGC: [...], SAME: [...] })
  const geocode = {};
  const geocodeSrc = Array.isArray(area.geocode) ? area.geocode : [];
  for (const g of geocodeSrc) {
    if (g.valueName && g.value) {
      if (!geocode[g.valueName]) geocode[g.valueName] = [];
      geocode[g.valueName].push(g.value);
    }
  }

  // Combine area descriptions from all area blocks
  const affectedArea = areaList.map(a => a.areaDesc).filter(Boolean).join('; ')
    || info.areaDesc || '';

  return {
    id:          identifier,
    type:        info.event || item.event || item.eventCode || '',
    headline:    info.headline || '',
    description: info.description || '',
    instruction: info.instruction || '',
    severity:    info.severity  || item.severity  || '',
    urgency:     info.urgency   || item.urgency   || '',
    certainty:   info.certainty || item.certainty || '',
    sent,
    effective:   info.effective || info.onset || sent,
    onset:       info.onset     || info.effective || sent,
    expires:     info.expires   || item.expires   || '',
    senderName:  info.senderName || item.senderName || item.sender || '',
    affectedArea,
    geocode,
    parameters:  {},
    geometry,
    source:      'fema',
  };
}

/**
 * Normalize the raw FEMA IPAWS JSON response.
 * Handles both the nested CAP format ({ alerts: [...] }) and flat arrays.
 * @param {object|Array} data  Raw API response
 * @returns {Array}  Normalized alert objects
 */
function normalizeAlerts(data) {
  const items = Array.isArray(data) ? data
    : data?.alerts ?? data?.features ?? data?.feed?.entry ?? [];
  return items.map(normalizeCAPEntry).filter(a => a.id && a.type);
}
