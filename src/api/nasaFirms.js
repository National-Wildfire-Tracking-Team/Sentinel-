/**
 * nasaFirms.js
 * NASA FIRMS – Fire Information for Resource Management System
 * Fetches real-time VIIRS + MODIS fire hotspot detections.
 *
 * API Docs: https://firms.modaps.eosdis.nasa.gov/api/
 * Free key: https://firms.modaps.eosdis.nasa.gov/api/
 *
 * Without a key, returns mock data so the UI still works in demo mode.
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_FIRE_HOTSPOTS } from '../data/mockData';

// Area endpoint. Country endpoint is not recommended for large countries (USA, China, Canada, Russia)
// because the complex polygon geometry causes request timeouts / "Invalid API call." errors.
const FIRMS_BASE = '/api/firms/api/area';
const FIRMS_STATUS_BASE = '/api/firms/mapserver/mapkey_status';

// Trim accidental whitespace that can slip in from env var copy-paste.
const MAP_KEY = import.meta.env.VITE_NASA_FIRMS_API_KEY?.trim();

// Proactively validate the MAP key so misconfiguration is easy to spot in the console.
// Fire-and-forget – does not block data requests.
(function checkMapKey() {
  if (!MAP_KEY || MAP_KEY === 'your_firms_map_key_here') return;
  fetch(`${FIRMS_STATUS_BASE}/?MAP_KEY=${encodeURIComponent(MAP_KEY)}`)
    .then(r => r.json())
    .then(data => {
      if (typeof data.current_transactions === 'number') {
        console.info(`[FIRMS] MAP key OK – ${data.current_transactions} transactions used in current period`);
      } else {
        console.warn('[FIRMS] MAP key may be invalid or expired. Renew at https://firms.modaps.eosdis.nasa.gov/api/', data);
      }
    })
    .catch(() => { /* network error – non-fatal */ });
}());

/**
 * Fetch fire hotspots for a bounding box.
 * @param {object} bounds  { west, south, east, north }  (decimal degrees)
 * @param {number} days    Look-back window (1–10 days)
 * @param {string} source  'VIIRS_SNPP_NRT' | 'VIIRS_NOAA20_NRT' | 'MODIS_NRT'
 * @returns {Promise<Array>}  Array of hotspot objects
 */
export async function fetchFireHotspots(
  bounds = { west: -130, south: 24, east: -65, north: 50 },
  days = 1,
  source = 'VIIRS_SNPP_NRT',
) {
  // Fallback to mock data when no API key is configured
  if (!MAP_KEY || MAP_KEY === 'your_firms_map_key_here') {
    console.info('[FIRMS] No API key – using demo data');
    return MOCK_FIRE_HOTSPOTS;
  }

  const area = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const url = `${FIRMS_BASE}/json/${MAP_KEY}/${source}/${area}/${days}`;
  const cacheKey = `firms:${source}:${area}:${days}`;

  try {
    const data = await fetchWithCache(url, cacheKey, {}, 5 * 60 * 1000);
    return normalizeHotspots(data);
  } catch (err) {
    if (err.message.includes('Invalid API call')) {
      console.error(
        '[FIRMS] "Invalid API call" – MAP key is missing, expired, or invalid.',
        'Renew at https://firms.modaps.eosdis.nasa.gov/api/',
      );
    } else {
      console.error('[FIRMS] Fetch failed, falling back to mock data:', err.message);
    }
    return MOCK_FIRE_HOTSPOTS;
  }
}

/**
 * Keep FIRMS records as close to raw JSON as possible while
 * guaranteeing a stable `id` and numeric coordinates for map use.
 */
function normalizeHotspots(records) {
  return records.map((r, i) => ({
    ...r,
    id: r.id || `firms-${r.acq_date || 'unknown'}-${i}`,
    latitude: parseFloat(r.latitude),
    longitude: parseFloat(r.longitude),
  }));
}

function normalizeConfidence(raw) {
  if (!raw) return 'nominal';
  const s = String(raw).toLowerCase();
  if (s === 'h' || s === 'high')   return 'high';
  if (s === 'l' || s === 'low')    return 'low';
  const n = parseInt(s, 10);
  if (!isNaN(n)) {
    if (n >= 80) return 'high';
    if (n >= 40) return 'nominal';
    return 'low';
  }
  return 'nominal';
}

/**
 * Passes raw hotspot objects through without grouping.
 * Allows every individual detection from the satellite to render on the map.
 *
 * @param {Array} hotspots  Raw hotspot objects with latitude/longitude
 * @returns {Array}  The original, unconsolidated hotspot objects
 */
export function consolidateHotspots(hotspots) {
  // Return the data directly without grouping it into grid cells
  return hotspots || [];
}

/**
 * Convert array of hotspot objects into a GeoJSON FeatureCollection
 * suitable for use as a Mapbox Source.
 */
export function hotspotsToGeoJSON(hotspots) {
  // Fixed FIRMS-style box size so every hotspot is rendered uniformly.
  const BOX_SIZE_KM = 2;
  const kmToLatDeg = (km) => km / 111.32;
  const kmToLngDeg = (km, lat) => {
    const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
    return km / (111.32 * cosLat);
  };

  return {
    type: 'FeatureCollection',
    features: hotspots.map(h => ({
      type: 'Feature',
      geometry: (() => {
        const halfLat = kmToLatDeg(BOX_SIZE_KM) / 2;
        const halfLng = kmToLngDeg(BOX_SIZE_KM, h.latitude) / 2;
        const west = h.longitude - halfLng;
        const east = h.longitude + halfLng;
        const south = h.latitude - halfLat;
        const north = h.latitude + halfLat;

        return {
          type: 'Polygon',
          coordinates: [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ]],
        };
      })(),
      properties: {
        id:              h.id,
        frp:             h.frp,
        total_frp:       h.total_frp || h.frp,
        brightness:      h.brightness,
        latitude:        h.latitude,
        longitude:       h.longitude,
        scan:            h.scan,
        track:           h.track,
        confidence:      h.confidence,
        satellite:       h.satellite,
        source:          h.source,
        acq_date:        h.acq_date,
        acq_time:        h.acq_time,
        daynight:        h.daynight,
        detection_count: h.detection_count || 1,
      },
    })),
  };
}
