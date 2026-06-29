/**
 * nasaFirms.js
 * NASA FIRMS – Fire Information for Resource Management System
 * Fetches real-time VIIRS + MODIS fire hotspot detections.
 *
 * API Docs: https://firms.modaps.eosdis.nasa.gov/api/
 *
 * Without Supabase or a direct API key, returns mock data so the UI
 * still works in demo mode.
 *
 * NOTE: FIRMS only serves CSV responses. There is no JSON endpoint –
 * requests to /api/area/json/ return a 400 with an HTML error page.
 * All data is fetched as CSV and parsed client-side.
 */

import { getCached, setCached } from '../utils/dataCache';
import { acquireSlot } from '../utils/firmsRateLimiter';
import { MOCK_FIRE_HOTSPOTS } from '../data/mockData';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { throttleError } from '../utils/errorThrottle';

const IS_DEV = import.meta.env.DEV;

// Direct-access fallback via Netlify edge-function proxy (requires
// VITE_NASA_FIRMS_API_KEY in .env – key will be visible in the URL).
const FIRMS_BASE = '/api/firms/api/area';
const MAP_KEY = import.meta.env.VITE_NASA_FIRMS_API_KEY;

/**
 * Parse a single CSV line into an array of field values, handling
 * RFC 4180 quoted fields (e.g. `"-120.45"` or `"field, with comma"`).
 */
function parseCSVLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field – collect until closing quote (doubled quotes "" are escaped)
      let value = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i++];
        }
      }
      fields.push(value);
      if (i < line.length && line[i] === ',') i++; // skip delimiter
    } else {
      // Unquoted field – read until next comma or end
      const next = line.indexOf(',', i);
      if (next === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, next));
      i = next + 1;
    }
  }
  // A trailing comma means the final field is an empty string
  if (line.length > 0 && line[line.length - 1] === ',') fields.push('');
  return fields;
}

/**
 * Parse a FIRMS CSV text blob into an array of plain objects.
 * The first line is the header row; subsequent lines are records.
 * Handles both LF and CRLF line endings and RFC 4180 quoted fields.
 */
function parseFirmsCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
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

  await acquireSlot();
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
 * Fetch FIRMS CSV via the Supabase edge function (preferred) so the
 * API key stays server-side. Returns parsed & normalised hotspot rows.
 */
async function fetchViaSupabase(source, area, days, cacheKey) {
  await acquireSlot();
  const { data, error } = await supabase.functions.invoke('firms-proxy', {
    body: { source, area, days: String(days) },
  });

  if (error) throw new Error(error.message || 'Edge function error');

  // The edge function returns raw CSV text (Content-Type: text/csv).
  // supabase-js returns text/* responses as a string.
  const csvText = typeof data === 'string' ? data : '';
  if (!csvText.trim()) return [];

  const rows = parseFirmsCSV(csvText);
  setCached(cacheKey, rows, 5 * 60 * 1000);
  return rows;
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
  const area = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const cacheKey = `firms:${source}:${area}:${days}`;

  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  // 1. Primary path: Netlify edge function proxy (more reliable, no CORS issues)
  if (MAP_KEY) {
    try {
      const url = `${FIRMS_BASE}/csv/${MAP_KEY}/${source}/${area}/${days}`;
      return normalizeHotspots(await fetchFirmsCSV(url, cacheKey));
    } catch (err) {
      throttleError('[FIRMS]', 'Netlify edge function failed, trying Supabase fallback:', err, {
        friendlyType: 'netlify',
      });
    }
  }

  // 2. Fallback: Supabase edge function (key stays server-side, but may have CORS issues)
  // Skip in dev mode — edge function lacks CORS headers for localhost
  if (isSupabaseConfigured && !IS_DEV) {
    try {
      return normalizeHotspots(await fetchViaSupabase(source, area, days, cacheKey));
    } catch (err) {
      throttleError('[FIRMS]', 'Supabase edge function failed, trying fallback:', err, {
        friendlyType: 'supabase',
      });
    }
  }

  // 3. No API access – use demo data
  if (!MAP_KEY) {
    throttleError('[FIRMS]', 'No API key configured – using demo data', null, {
      friendlyType: 'demo',
      ttlMs: 60 * 60 * 1000, // Only log once per hour for demo mode
    });
  }
  return withRecentAcquisition(MOCK_FIRE_HOTSPOTS);
}

/**
 * Stamp each mock hotspot with an acq_date / acq_time in the last few hours
 * so the client-side recency filter keeps it. Without this, the demo fallback
 * (and any live fetch failure that falls back to it) leaves the map empty.
 */
function withRecentAcquisition(hotspots) {
  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const acqTime = `${hh}${mm}`;
  return hotspots.map((h) => ({ ...h, acq_date: isoDate, acq_time: acqTime }));
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
 * Convert parsed CSV hotspot rows directly into a GeoJSON FeatureCollection
 * of Point features. Uses the latitude/longitude values straight from the
 * CSV data rather than fabricating polygon geometry.
 */
export function csvHotspotsToPoints(hotspots) {
  return {
    type: 'FeatureCollection',
    features: hotspots.map(h => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [h.longitude, h.latitude],
      },
      properties: {
        id:              h.id,
        frp:             h.frp,
        total_frp:       h.total_frp || h.frp,
        brightness:      h.brightness,
        latitude:        h.latitude,
        longitude:       h.longitude,
        scan:            h.scan,
        track:           h.track,
        confidence:      normalizeConfidence(h.confidence),
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
