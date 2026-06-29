/**
 * nhcStorms.js
 * NOAA National Hurricane Center (NHC) GIS — real-time tropical cyclone data.
 * No API key required. All endpoints are public NOAA government data.
 *
 * Data sources:
 *   - Active storms list:  https://www.nhc.noaa.gov/CurrentStorms.json
 *   - Advisory GeoJSON:    https://www.nhc.noaa.gov/gis/forecast/archive/{id}_{adv}_5day_{type}.json
 *     types: pgn (cone polygon), lin (track line)
 *
 * Docs: https://www.nhc.noaa.gov/gis/
 */

import { getCached, setCached } from '../utils/dataCache';
import { throttleError } from '../utils/errorThrottle';

// Requests go through the server-side proxy (Netlify edge fn / Vite dev proxy)
// to work around nhc.noaa.gov's missing CORS headers for cross-origin requests.
const NHC_STORMS_URL = '/api/nhc/current';
const NHC_GIS_PROXY  = '/api/nhc/gis';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes – advisories issued every 3-6 h

/**
 * Parse NHC coordinate strings like "25.2N" / "83.4W" → signed decimal degrees.
 * Returns null on parse failure.
 */
function parseNhcCoord(str) {
  if (!str) return null;
  const m = String(str).match(/^([\d.]+)([NSEWnsew])$/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const dir = m[2].toUpperCase();
  return dir === 'S' || dir === 'W' ? -val : val;
}

/**
 * Return a human-readable category label and 0-5 rank from intensity + classification.
 */
function stormCategory(intensityKts, classification) {
  const cls = String(classification || '').toUpperCase();
  const kt  = Number(intensityKts) || 0;

  if (cls === 'TD' || cls === 'SD') return { label: 'Tropical Depression', rank: 0 };
  if (cls === 'TS' || cls === 'SS') return { label: 'Tropical Storm',      rank: 1 };
  if (cls === 'EX')                  return { label: 'Extratropical',       rank: 0 };
  if (cls === 'PT')                  return { label: 'Post-Tropical',       rank: 0 };
  if (cls === 'DB' || cls === 'LO' || cls === 'WV') return { label: 'Disturbance', rank: 0 };

  if (cls === 'HU' || cls === 'TY') {
    if (kt >= 137) return { label: 'Category 5 Hurricane', rank: 5 };
    if (kt >= 113) return { label: 'Category 4 Hurricane', rank: 4 };
    if (kt >= 96)  return { label: 'Category 3 Hurricane', rank: 3 };
    if (kt >= 83)  return { label: 'Category 2 Hurricane', rank: 2 };
    return         { label: 'Category 1 Hurricane',        rank: 1 };
  }

  return { label: classification || 'Tropical Cyclone', rank: 0 };
}

/**
 * Map a storm's intensity/classification to a hex colour for map rendering.
 * Matches the NOAA Saffir–Simpson colour convention adapted for a dark map.
 * @param {number|string} intensityKts
 * @param {string} classification  NHC type code (HU, TS, TD, EX, …)
 * @returns {string}  hex colour
 */
export function nhcStormColor(intensityKts, classification) {
  const { rank, label } = stormCategory(intensityKts, classification);
  const lc = label.toLowerCase();
  if (rank === 5) return '#c026d3'; // fuchsia   — Category 5
  if (rank === 4) return '#ef4444'; // red        — Category 4
  if (rank === 3) return '#f97316'; // orange     — Category 3
  if (rank === 2) return '#eab308'; // amber      — Category 2
  if (rank === 1 && lc.includes('hurricane')) return '#facc15'; // yellow — Cat 1
  if (lc.includes('tropical storm') || lc.includes('subtropical storm')) return '#38bdf8'; // sky
  if (lc.includes('depression')) return '#64748b'; // slate-500
  return '#94a3b8'; // default
}

/**
 * Fetch active NHC storms from CurrentStorms.json.
 * Returns a GeoJSON FeatureCollection of storm centre points.
 */
export async function fetchNhcActiveStorms() {
  const cacheKey = 'nhc:storms';
  const hit = getCached(cacheKey);
  if (hit !== null) return hit;

  try {
    const res = await fetch(NHC_STORMS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = data?.activeStorms ?? [];

    const features = list.flatMap((storm) => {
      const lat = parseNhcCoord(storm.latitude);
      const lon = parseNhcCoord(storm.longitude);
      if (lat === null || lon === null) return [];
      const { label } = stormCategory(storm.intensity, storm.classification);
      return [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id:           storm.id,
          name:         storm.name || storm.id,
          classification: storm.classification || '',
          category:     label,
          intensityKts: Number(storm.intensity) || 0,
          intensityMph: Math.round((Number(storm.intensity) || 0) * 1.15078),
          pressure:     Number(storm.pressure) || null,
          movement:     storm.movement || '',
          advNum:       storm.publicAdvNum || '',
          advUrl:       storm.publicAdv || '',
          lastUpdate:   storm.lastUpdate || '',
        },
      }];
    });

    const result = { type: 'FeatureCollection', features };
    setCached(cacheKey, result, CACHE_TTL);
    return result;
  } catch (err) {
    throttleError('[NHC]', 'CurrentStorms fetch failed:', err, {
      friendlyType: 'generic',
    });
    return { type: 'FeatureCollection', features: [] };
  }
}

async function tryFetchGeoJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Attempt to fetch the cone-of-uncertainty and track line GeoJSON for one storm advisory.
 * Returns { cone, track } where either may be null if unavailable (no active storms, CORS, etc.).
 */
export async function fetchNhcForecastData(stormId, advNum) {
  if (!stormId || !advNum) return { cone: null, track: null };
  const pad = String(advNum).padStart(3, '0');
  const makeUrl = (type) =>
    `${NHC_GIS_PROXY}?file=${stormId}_${pad}_5day_${type}.json`;
  const [cone, track] = await Promise.all([
    tryFetchGeoJSON(makeUrl('pgn')),
    tryFetchGeoJSON(makeUrl('lin')),
  ]);
  return { cone, track };
}

/**
 * Fetch all NHC data: active storm centres + per-storm forecast cone and track.
 * Result is cached for 10 minutes.
 * @returns {Promise<{centers, cones, tracks}>}  Three GeoJSON FeatureCollections
 */
export async function fetchAllNhcData() {
  const cacheKey = 'nhc:all';
  const hit = getCached(cacheKey);
  if (hit !== null) return hit;

  const centers      = await fetchNhcActiveStorms();
  const coneFeatures  = [];
  const trackFeatures = [];

  await Promise.all(centers.features.map(async (f) => {
    const { id, name, advNum } = f.properties;
    const { cone, track } = await fetchNhcForecastData(id, advNum);

    if (cone?.features) {
      for (const cf of cone.features) {
        coneFeatures.push({
          ...cf,
          properties: { ...cf.properties, stormId: id, stormName: name },
        });
      }
    }
    if (track?.features) {
      for (const tf of track.features) {
        trackFeatures.push({
          ...tf,
          properties: { ...tf.properties, stormId: id, stormName: name },
        });
      }
    }
  }));

  const result = {
    centers,
    cones:  { type: 'FeatureCollection', features: coneFeatures  },
    tracks: { type: 'FeatureCollection', features: trackFeatures },
  };
  setCached(cacheKey, result, CACHE_TTL);
  return result;
}
