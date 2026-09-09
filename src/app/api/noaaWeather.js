/**
 * noaaWeather.js
 * NOAA/NWS Weather API – Public US government data, no API key required.
 *
 * Endpoints used:
 * - Active alerts: https://api.weather.gov/alerts/active
 * - Returns all active NWS alerts nationwide; callers filter down to
 *   fire-specific types (Red Flag Warning / Fire Weather Watch) as needed
 *   via filterFireWeatherAlerts().
 *
 * Docs: https://www.weather.gov/documentation/services-web-api
 */

import { getCached, setCached } from '../utils/dataCache';

const NOAA_BASE = 'https://api.weather.gov';

export const FIRE_WEATHER_ALERT_TYPES = new Set([
  'red flag warning',
  'fire weather watch',
]);

const NWS_HEADERS = {
  'User-Agent': 'Sentinel Wildfire Platform (contact@sentinel.app)',
  Accept: 'application/geo+json',
};

// Zone geometry cache — persists for the app's lifetime since zone boundaries
// change rarely. Keyed by UGC code (e.g. "CAZ006"), value is a GeoJSON geometry.
const zoneGeometryCache = new Map();

// Negative cache for zone codes that 404 (stale/renumbered/retired UGC codes).
// A 404 from NWS's own zone catalog means the code doesn't exist there at all —
// that's not something that resolves itself within the hour, so cool down for
// a full day instead of hammering a permanently-dead zone every poll.
// Keyed by UGC code, value is the timestamp of the last failed attempt.
const zoneGeometryFailureCache = new Map();
const ZONE_FAILURE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // retry a failed zone at most once/day

// Modern NWS UGC zone/county code: 2-letter state (or marine-area) prefix +
// 'C' (county) or 'Z' (forecast/fire/marine zone) + 3-digit number, e.g.
// "CAZ006", "GAZ125", "TXC201". Anything else is not a real NWS zone id and
// must never be sent to /zones/*, since that either 404s or silently
// mis-hits an unrelated zone.
const ZONE_ID_PATTERN = /^[A-Z]{2}[CZ]\d{3}$/;

export function isValidZoneId(code) {
  return typeof code === 'string' && ZONE_ID_PATTERN.test(code);
}

// NWS alerts carry an authoritative `affectedZones` array of full zone API
// URLs (e.g. "https://api.weather.gov/zones/fire/GAZ125"). The URL's own path
// segment tells us which catalog (forecast/county/fire/marine) that UGC code
// actually lives in — no guessing required. Public forecast zones and fire
// weather zones both use the letter 'Z' in the UGC code itself, so inferring
// catalog from the code alone (as this module used to) is not reliable.
function parseAffectedZoneTypes(alerts) {
  const codeToType = new Map();
  for (const alert of alerts) {
    for (const url of (alert.affectedZones || [])) {
      const match = /\/zones\/([a-z]+)\/([A-Z0-9]+)\/?$/i.exec(url);
      if (match) codeToType.set(match[2].toUpperCase(), match[1].toLowerCase());
    }
  }
  return codeToType;
}

/**
 * Flatten any GeoJSON geometry into an array of Polygon coordinate arrays.
 * Handles Polygon, MultiPolygon, and GeometryCollection recursively.
 * Returns [] for unsupported or null geometry (e.g. Point, LineString).
 * @param {object|null} geom  GeoJSON geometry object
 * @returns {Array[][]}  Array of polygon coordinate rings
 */
function extractPolygonCoords(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon')          return [geom.coordinates];
  if (geom.type === 'MultiPolygon')     return geom.coordinates;
  if (geom.type === 'GeometryCollection')
    return geom.geometries.flatMap(extractPolygonCoords);
  return [];
}

/**
 * Normalize any GeoJSON geometry to Polygon or MultiPolygon so Mapbox GL JS
 * can render it. GeometryCollection and other types are flattened.
 * Returns null if no polygon coordinates could be extracted.
 * @param {object|null} geom
 * @returns {object|null}
 */
export function flattenGeometry(geom) {
  const coords = extractPolygonCoords(geom);
  if (coords.length === 0) return null;
  if (coords.length === 1) return { type: 'Polygon', coordinates: coords[0] };
  return { type: 'MultiPolygon', coordinates: coords };
}

/**
 * Fetch zone geometries from the NWS /zones/{type}/{id} endpoint.
 * The list endpoint (/zones?id=...) doesn't return geometry regardless of
 * query params — only the single-zone endpoint does — so this fetches one
 * zone at a time through a small worker pool. Results are stored in
 * zoneGeometryCache.
 * @param {string[]} codes  Array of already-validated, deduplicated UGC codes to fetch
 * @param {Map<string,string>} codeToType  UGC code → catalog type ('forecast'|'county'|'fire'|'marine'),
 *   parsed from each alert's authoritative `affectedZones` URLs.
 */
async function fetchZoneGeometryBatch(codes, codeToType) {
  if (codes.length === 0) return;

  const CONCURRENCY = 12;
  const queue = [...codes];

  async function worker() {
    while (queue.length > 0) {
      const code = queue.shift();
      // Prefer the catalog NWS itself reported for this zone. Only fall back
      // to a bare guess when an alert didn't carry `affectedZones` — a wrong
      // guess just 404s once and is cooled down by the negative cache below.
      const type = codeToType.get(code) || 'forecast';
      try {
        const res = await fetch(`${NOAA_BASE}/zones/${type}/${code}`, {
          headers: NWS_HEADERS,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          zoneGeometryFailureCache.set(code, Date.now());
          continue;
        }
        const data = await res.json();
        const id = data.properties?.id || code;
        if (data.geometry) zoneGeometryCache.set(id, data.geometry);
      } catch {
        // Network error/timeout — treat the same as a failed lookup so it cools down too
        zoneGeometryFailureCache.set(code, Date.now());
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, codes.length) }, worker));
}

/**
 * Enrich alerts that lack a direct geometry by fetching NWS zone boundaries
 * for their UGC zone codes. Alerts that already have geometry are passed through
 * unchanged. Zone polygons for a single alert are merged into a MultiPolygon.
 * @param {Array} alerts  Normalized alert objects from normalizeAlerts()
 * @param {Set<string>} [skipCodes]  UGC codes to skip — e.g. codes the caller
 *   already resolved from bulk-loaded zone/county/CWA reference data, so this
 *   function only has to hit the live NWS API for genuine gaps.
 * @returns {Promise<Array>}  Alerts with geometry filled in where possible
 */
export async function enrichAlertsWithGeometry(alerts, skipCodes) {
  const noGeo = alerts.filter(a => !a.geometry);
  if (noGeo.length === 0) return alerts;

  // Collect UGC codes that aren't already cached, skipping codes that failed
  // recently (within the cooldown window) so dead zone IDs stop being retried
  // on every poll, codes already resolvable from bulk reference data, and any
  // code that isn't shaped like a real NWS zone id.
  const now = Date.now();
  const needed = new Set();
  for (const alert of noGeo) {
    for (const code of (alert.geocode?.UGC || [])) {
      if (!isValidZoneId(code)) continue;
      if (skipCodes?.has(code)) continue;
      if (zoneGeometryCache.has(code)) continue;
      const failedAt = zoneGeometryFailureCache.get(code);
      if (failedAt && now - failedAt < ZONE_FAILURE_COOLDOWN_MS) continue;
      needed.add(code);
    }
  }

  if (needed.size > 0) {
    const codeToType = parseAffectedZoneTypes(noGeo);
    await fetchZoneGeometryBatch([...needed], codeToType);
  }

  return alerts.map(alert => {
    if (alert.geometry) return alert;

    const polygons = [];
    for (const code of (alert.geocode?.UGC || [])) {
      const geom = zoneGeometryCache.get(code);
      if (!geom) continue;
      polygons.push(...extractPolygonCoords(geom));
    }

    if (polygons.length === 0) return alert; // Still no geometry — skip on map
    return {
      ...alert,
      geometry: polygons.length === 1
        ? { type: 'Polygon', coordinates: polygons[0] }
        : { type: 'MultiPolygon', coordinates: polygons },
    };
  });
}

/**
 * Filter a list of normalized alerts down to fire-specific types
 * (Red Flag Warning / Fire Weather Watch) for wildfire-focused views.
 * @param {Array} alerts  Normalized alert objects
 * @returns {Array}  Alerts whose type is fire-related
 */
export function filterFireWeatherAlerts(alerts) {
  return alerts.filter(alert =>
    FIRE_WEATHER_ALERT_TYPES.has(alert.type?.trim().toLowerCase())
  );
}

/**
 * Fetch all active NOAA/NWS alerts nationwide, following NWS API pagination.
 * Results are cached for 5 minutes. Callers that only want fire-related
 * alerts should apply filterFireWeatherAlerts() to the result.
 * @returns {Promise<Array>}  Normalized alert objects
 */
export async function fetchNWSAlerts() {
  const cacheKey = 'noaa:nws-alerts-active';
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    // Build URL with literal comma so NWS receives message_type=alert,update
    // (URLSearchParams would encode the comma to %2C which some NWS endpoints reject)
    let url = `${NOAA_BASE}/alerts/active?status=actual&message_type=alert,update`;
    const allFeatures = [];

    // Follow pagination.next until all pages are consumed
    while (url) {
      const res = await fetch(url, { headers: NWS_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      for (const f of (data.features || [])) allFeatures.push(f);
      url = data.pagination?.next ?? null;
    }

    if (!allFeatures.length) throw new Error('No active alerts');
    const normalized = normalizeAlerts(allFeatures);
    setCached(cacheKey, normalized, 5 * 60 * 1000);
    return normalized;
  } catch (err) {
    console.warn('[NOAA] NWS fetch failed:', err.message);
    return [];
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
      affectedZones: p.affectedZones || [], // authoritative typed zone API URLs, e.g. ".../zones/fire/GAZ125"
      parameters:   p.parameters,  // { VTEC: [...], WMOidentifier: [...], ... }
      // Flatten GeometryCollection → Polygon/MultiPolygon so Mapbox can render it
      geometry:     flattenGeometry(f.geometry),
    };
  });
}

/**
 * Fetch active weather alerts for a specific lat/lng point.
 * Uses the NOAA /alerts/active endpoint with the point parameter.
 * Follows pagination so all alerts for the point are returned.
 * @param {number} lat  Latitude
 * @param {number} lng  Longitude
 * @returns {Promise<Array>}  Normalized alert objects for that location
 */
export async function fetchAlertsByPoint(lat, lng) {
  let url = `${NOAA_BASE}/alerts/active?point=${lat},${lng}&status=actual&message_type=alert,update`;
  const allFeatures = [];

  while (url) {
    const res = await fetch(url, { headers: NWS_HEADERS });
    if (!res.ok) throw new Error(`NOAA API error: ${res.status}`);
    const data = await res.json();
    for (const f of (data.features || [])) allFeatures.push(f);
    url = data.pagination?.next ?? null;
  }

  if (!allFeatures.length) return [];
  return normalizeAlerts(allFeatures);
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
          id:          a.id,
          type:        a.type,
          headline:    a.headline,
          description: a.description,
          severity:    a.severity,
          expires:     a.expires,
          source:      a.source || 'NWS',
        },
      })),
  };
}
