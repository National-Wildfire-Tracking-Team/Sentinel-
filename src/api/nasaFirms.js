/**
 * nasaFirms.js
 * NASA FIRMS – Fire Information for Resource Management System
 * Fetches real-time VIIRS + MODIS fire hotspot detections.
 *
 * API Docs: https://firms.modaps.eosdis.nasa.gov/api/
 * Free key: https://firms.modaps.eosdis.nasa.gov/api/
 *
 * Without a key, returns mock data so the UI still works in demo mode.
 *
 * NOTE: FIRMS only serves CSV responses. There is no JSON endpoint –
 * requests to /api/area/json/ return a 400 with an HTML error page.
 */

import { getCached, setCached } from '../utils/dataCache';
import { MOCK_FIRE_HOTSPOTS } from '../data/mockData';

// Area endpoint with CSV format.
// Country endpoint is not recommended for large countries (USA, Canada, China, Russia)
// because the complex polygon geometry causes timeouts / "Invalid API call." errors.
const FIRMS_BASE = '/api/firms/api/area';
const MAP_KEY = import.meta.env.VITE_NASA_FIRMS_API_KEY;

/**
 * Parse a FIRMS CSV text blob into an array of plain objects.
 * The first line is the header row; subsequent lines are records.
 * Handles both LF and CRLF line endings.
 */
function parseFirmsCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] ?? '').trim(); });
    return obj;
  });
}

/**
 * Fetch a FIRMS CSV URL and return the parsed rows, with 5-minute caching.
 */
async function fetchFirmsCSV(url, cacheKey) {
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  const res = await fetch(url);
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status}: ${res.statusText}${body ? ` – ${body.slice(0, 200)}` : ''}`);
  }
  const data = parseFirmsCSV(await res.text());
  setCached(cacheKey, data, 5 * 60 * 1000);
  return data;
}

/**
 * Fetch fire hotspots for a bounding box.
 * @param {object} bounds  { west, south, east, north }  (decimal degrees)
 * @param {number} days    Look-back window (1–10 days)
 * @param {string} source  'VIIRS_SNPP_NRT' | 'MODIS_NRT'
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
  const url = `${FIRMS_BASE}/csv/${MAP_KEY}/${source}/${area}/${days}`;
  const cacheKey = `firms:${source}:${area}:${days}`;

  try {
    return normalizeHotspots(await fetchFirmsCSV(url, cacheKey));
  } catch (err) {
    console.error('[FIRMS] Fetch failed, falling back to mock data:', err.message);
    return MOCK_FIRE_HOTSPOTS;
  }
}

/**
 * Normalise a raw FIRMS CSV row into the shape the rest of the app expects.
 * - Guarantees numeric lat/lng and frp.
 * - Unifies the VIIRS (bright_ti4) and MODIS (brightness) brightness fields.
 */
function normalizeHotspots(records) {
  return records.map((r, i) => ({
    ...r,
    id:         r.id || `firms-${r.acq_date || 'unknown'}-${i}`,
    latitude:   parseFloat(r.latitude),
    longitude:  parseFloat(r.longitude),
    frp:        parseFloat(r.frp) || 0,
    // VIIRS CSV uses bright_ti4; MODIS CSV uses brightness – expose as brightness.
    brightness: parseFloat(r.brightness || r.bright_ti4) || 0,
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
