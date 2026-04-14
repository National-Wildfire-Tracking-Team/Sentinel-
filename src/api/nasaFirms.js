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

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area';
const MAP_KEY = import.meta.env.VITE_NASA_FIRMS_API_KEY;

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
  const url = `${FIRMS_BASE}/json/${MAP_KEY}/${source}/${area}/${days}`;
  const cacheKey = `firms:${source}:${area}:${days}`;

  try {
    const data = await fetchWithCache(url, cacheKey, {}, 5 * 60 * 1000);
    return normalizeHotspots(data);
  } catch (err) {
    console.error('[FIRMS] Fetch failed, falling back to mock data:', err.message);
    return MOCK_FIRE_HOTSPOTS;
  }
}

/**
 * Convert raw FIRMS JSON records into a consistent shape.
 * Adds a unique id and normalizes confidence strings.
 */
function normalizeHotspots(records) {
  return records.map((r, i) => ({
    id: `firms-${r.acq_date}-${i}`,
    latitude:   parseFloat(r.latitude),
    longitude:  parseFloat(r.longitude),
    brightness: parseFloat(r.bright_ti4 || r.brightness || 0),
    frp:        parseFloat(r.frp || 0),
    scan:       parseFloat(r.scan || 1),
    track:      parseFloat(r.track || 1),
    confidence: normalizeConfidence(r.confidence),
    satellite:  r.satellite || 'Unknown',
    source:     r.source || r.instrument || 'Unknown',
    acq_date:   r.acq_date,
    acq_time:   r.acq_time,
    daynight:   r.daynight || 'D',
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
 * Convert array of hotspot objects into a GeoJSON FeatureCollection
 * suitable for use as a Mapbox Source.
 */
export function hotspotsToGeoJSON(hotspots) {
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
        const halfLat = kmToLatDeg(h.scan || 1) / 2;
        const halfLng = kmToLngDeg(h.track || 1, h.latitude) / 2;
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
        id:         h.id,
        frp:        h.frp,
        brightness: h.brightness,
        latitude:   h.latitude,
        longitude:  h.longitude,
        scan:       h.scan,
        track:      h.track,
        confidence: h.confidence,
        satellite:  h.satellite,
        source:     h.source,
        acq_date:   h.acq_date,
        acq_time:   h.acq_time,
        daynight:   h.daynight,
      },
    })),
  };
}
