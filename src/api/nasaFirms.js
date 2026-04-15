/**
 * nasaFirms.js
 * NASA FIRMS – Fire Information for Resource Management System
 * Fetches real-time VIIRS + MODIS fire hotspot detections.
 *
 * API Docs: https://firms.modaps.eosdis.nasa.gov/api/
 *
 * All requests are proxied through the Supabase `firms-proxy` edge function
 * so the NASA MAP key never touches the browser.
 * Deploy secret: supabase secrets set NASA_FIRMS_API_KEY=<your_key>
 *
 * Without Supabase configured, returns mock data so the UI still works in demo mode.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getCached, setCached } from '../utils/dataCache';
import { MOCK_FIRE_HOTSPOTS } from '../data/mockData';

const FIRMS_BASE = '/api/firms/api/area';
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
  if (!isSupabaseConfigured) {
    console.info('[FIRMS] Supabase not configured – using demo data');
    return MOCK_FIRE_HOTSPOTS;
  }

  const area = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const cacheKey = `firms:${source}:${area}:${days}`;

  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  try {
    const { data, error } = await supabase.functions.invoke('firms-proxy', {
      body: { source, area, days: String(days) },
    });

    if (error) throw new Error(error.message);

    const normalized = normalizeHotspots(Array.isArray(data) ? data : []);
    setCached(cacheKey, normalized, 5 * 60 * 1000);
    return normalized;
  } catch (err) {
    console.error('[FIRMS] Fetch failed, falling back to mock data:', err.message);
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
