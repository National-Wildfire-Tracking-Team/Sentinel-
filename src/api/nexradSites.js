/**
 * nexradSites.js
 * NWS/NOAA NEXRAD (WSR-88D) Level 2 radar site locations + live operability
 * status, from api.weather.gov — public, no key required, open CORS.
 *
 *   GET /radar/stations – all ~200 stations in one request, each already
 *   carrying live `rda.properties` (status, operabilityStatus, alarmSummary,
 *   mode) and `latency.current.levelTwoLastReceivedTime`. No per-station
 *   polling needed.
 */

import { getCached, setCached } from '../utils/dataCache';

const BASE = 'https://api.weather.gov/radar/stations';
const HEADERS = { Accept: 'application/geo+json' };
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_KEY = 'nws-nexrad-stations';

// A site whose Level 2 feed hasn't updated in this long is treated as not
// actually transmitting, even if its reported RDA status still says "Operate".
const STALE_MS = 60 * 60 * 1000;

/** Site status categories, in worst-to-best order for map z-ordering. */
export const NEXRAD_STATUS = {
  offline: { label: 'Offline / Down', color: '#ef4444' },
  alarm:   { label: 'Alarm / Degraded', color: '#f59e0b' },
  operate: { label: 'Operational', color: '#22c55e' },
  unknown: { label: 'Status Unknown', color: '#9ca3af' },
};

/** Classify a station's live RDA telemetry into one of NEXRAD_STATUS's keys. */
function classifyStatus(rda, levelTwoLastReceivedTime) {
  if (!rda?.properties) return 'unknown';
  const { status, operabilityStatus, alarmSummary } = rda.properties;

  const isOffline =
    /off-?line|shutdown|maintenance/i.test(operabilityStatus || '') ||
    (status && status !== 'Operate');
  if (isOffline) return 'offline';

  if (levelTwoLastReceivedTime) {
    const age = Date.now() - new Date(levelTwoLastReceivedTime).getTime();
    if (Number.isFinite(age) && age > STALE_MS) return 'offline';
  }

  if (alarmSummary && alarmSummary !== 'No Alarms') return 'alarm';

  return 'operate';
}

/** Convert one api.weather.gov radar-station feature into our GeoJSON feature shape. */
function stationToFeature(feature) {
  const p = feature?.properties ?? {};
  const [lon, lat] = feature?.geometry?.coordinates ?? [null, null];
  if (lat == null || lon == null) return null;

  const rda = p.rda ?? null;
  const levelTwoLastReceivedTime = p.latency?.current?.levelTwoLastReceivedTime ?? null;
  const status = classifyStatus(rda, levelTwoLastReceivedTime);

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(lon), Number(lat)] },
    properties: {
      id: p.id,
      name: p.name,
      stationType: p.stationType,
      status,
      statusLabel: NEXRAD_STATUS[status].label,
      rdaStatus: rda?.properties?.status ?? null,
      operabilityStatus: rda?.properties?.operabilityStatus ?? null,
      alarmSummary: rda?.properties?.alarmSummary ?? null,
      mode: rda?.properties?.mode ?? null,
      volumeCoveragePattern: rda?.properties?.volumeCoveragePattern ?? null,
      levelTwoLastReceivedTime,
    },
  };
}

/**
 * Fetch all NEXRAD Level 2 radar sites with live operability status.
 * A successful, non-empty result is cached for 5 minutes; empty/failed
 * responses are never cached so a transient outage doesn't blank the map.
 */
export async function fetchNexradSites() {
  const cached = getCached(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(BASE, { headers: HEADERS });
  if (!res.ok) throw new Error(`NWS radar stations HTTP ${res.status}`);

  const json = await res.json();
  const rawFeatures = Array.isArray(json?.features) ? json.features : [];
  const features = rawFeatures.map(stationToFeature).filter(Boolean);

  const geoJSON = { type: 'FeatureCollection', features };
  if (features.length > 0) setCached(CACHE_KEY, geoJSON, CACHE_TTL);
  return geoJSON;
}
