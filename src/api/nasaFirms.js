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
 * Consolidate nearby hotspot records into single representative detections.
 * Multiple satellites (VIIRS SNPP, VIIRS NOAA-20, MODIS) often detect the
 * same fire, producing overlapping markers.  This groups hotspots that fall
 * within approximately the same 2 km grid cell and merges each group into
 * one record with the highest FRP, all contributing sources, and the most
 * recent acquisition time.
 *
 * @param {Array} hotspots  Raw hotspot objects with latitude/longitude
 * @returns {Array}  Consolidated hotspot objects
 */
export function consolidateHotspots(hotspots) {
  if (!hotspots?.length) return hotspots || [];

  // ~2 km grid cell size in degrees (matches the FIRMS box size)
  const CELL_LAT = 0.018; // 2 km / 111.32 km per degree
  const CELL_LNG = 0.022; // slightly wider to compensate for longitude shrink at mid-latitudes

  const cellKey = (lat, lng) =>
    `${Math.round(lat / CELL_LAT)}:${Math.round(lng / CELL_LNG)}`;

  // Group hotspots by grid cell
  const groups = new Map();
  for (const h of hotspots) {
    const key = cellKey(h.latitude, h.longitude);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }

  // Merge each group into a single representative record
  return Array.from(groups.values()).map(group => {
    if (group.length === 1) return group[0];

    // Pick the detection with the highest FRP as the representative
    const best = group.reduce((a, b) =>
      (Number(b.frp) || 0) > (Number(a.frp) || 0) ? b : a
    );

    // Collect unique sources and satellites
    const sources    = [...new Set(group.map(h => h.source).filter(Boolean))];
    const satellites = [...new Set(group.map(h => h.satellite).filter(Boolean))];

    // Use the highest confidence
    const confidenceRank = { high: 3, nominal: 2, low: 1 };
    const bestConfidence = group.reduce((top, h) => {
      const c = normalizeConfidence(h.confidence);
      return (confidenceRank[c] || 0) > (confidenceRank[top] || 0) ? c : top;
    }, 'low');

    // Use the most recent acquisition date/time
    const latest = group.reduce((a, b) => {
      const aKey = `${a.acq_date || ''}${String(a.acq_time || '').padStart(4, '0')}`;
      const bKey = `${b.acq_date || ''}${String(b.acq_time || '').padStart(4, '0')}`;
      return bKey > aKey ? b : a;
    });

    // Sum FRP across detections for a combined intensity reading
    const totalFrp = group.reduce((sum, h) => sum + (Number(h.frp) || 0), 0);

    return {
      ...best,
      frp:             Number(best.frp) || 0,
      total_frp:       Math.round(totalFrp * 10) / 10,
      brightness:      Math.max(...group.map(h => Number(h.brightness) || 0)),
      confidence:      bestConfidence,
      source:          sources.join(', '),
      satellite:       satellites.join(', '),
      acq_date:        latest.acq_date,
      acq_time:        latest.acq_time,
      detection_count: group.length,
      sources,
      satellites,
    };
  });
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
