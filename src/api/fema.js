/**
 * fema.js
 * FEMA IPAWS Open EAS Service – Integrated Public Alert and Warning System
 * Fetches active Emergency Alert System (EAS) messages.
 *
 * Endpoint: https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/feed
 *
 * No API key required – public government data service.
 */

import { getCached, setCached } from '../utils/dataCache';

const url = "https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/feed";

/**
 * Fetch active EAS alerts from the FEMA IPAWS Open service.
 * Results are cached for 60 seconds.
 * @returns {Promise<Array>}  Normalized EAS alert objects
 */
export async function fetchFemaAlerts() {
  const cacheKey = 'fema:eas:feed';
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const res = await fetch(url, {
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

function normalizeAlerts(data) {
  const items = Array.isArray(data) ? data : data?.alerts ?? data?.features ?? [];
  return items.map(item => ({
    id:          item.id ?? item.identifier ?? '',
    event:       item.event ?? item.eventCode ?? '',
    headline:    item.headline ?? item.description ?? '',
    severity:    item.severity ?? '',
    urgency:     item.urgency ?? '',
    certainty:   item.certainty ?? '',
    effective:   item.effective ?? item.sent ?? '',
    expires:     item.expires ?? '',
    senderName:  item.senderName ?? item.sender ?? '',
    affectedArea: item.areaDesc ?? '',
    geometry:    item.geometry ?? null,
  }));
}
