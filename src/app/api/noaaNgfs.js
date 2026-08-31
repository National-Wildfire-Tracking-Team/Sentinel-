/**
 * noaaNgfs.js
 * NOAA NESDIS Next Generation Fire System (NGFS) – GOES-16/18 satellite
 * fire detections, served as an OGC API - Features collection.
 *
 * API Docs: https://fire.data.nesdis.noaa.gov/api/ogc/detections
 * Public endpoint: no API key required, CORS enabled (access-control-allow-origin: *).
 */

import { getCached, setCached } from '../utils/dataCache';
import { throttleError } from '../../shared/utils/errorThrottle';

const NGFS_BASE = 'https://fire.data.nesdis.noaa.gov/api/ogc/detections/collections';

// The CONUS collections already cover the full US disk; the mesoscale
// sub-collections are higher-frequency crops within that same coverage,
// so they're redundant for a nationwide layer.
const NGFS_COLLECTIONS = [
  'ngfs_schema.ngfs_detections_scene_east_conus',
  'ngfs_schema.ngfs_detections_scene_west_conus',
];

// `type` 0/1 are wildfire detections (possible / known incident); 2 covers
// non-fire thermal anomalies (volcanoes, oil/gas flares, industrial heat).
const WILDFIRE_TYPES = new Set([0, 1]);

// Comfortably above the current per-scene feature count (~600-1000) so a
// single request returns the full collection without pagination.
const PAGE_LIMIT = 3000;

async function fetchCollection(collectionId) {
  const cacheKey = `ngfs:${collectionId}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  const url = `${NGFS_BASE}/${collectionId}/items?f=json&limit=${PAGE_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  const features = data.features || [];
  setCached(cacheKey, features, 3 * 60 * 1000);
  return features;
}

/**
 * Fetch and merge GOES fire detections across the CONUS collections.
 * @returns {Promise<Array>} Raw GeoJSON Feature objects (Polygon pixel footprints)
 */
export async function fetchNgfsDetections() {
  try {
    const collections = await Promise.all(NGFS_COLLECTIONS.map(fetchCollection));
    return collections.flat();
  } catch (err) {
    throttleError('[NGFS]', 'Failed to load GOES fire detections', err, { friendlyType: 'generic' });
    return [];
  }
}

/**
 * Convert raw NGFS features into a Polygon FeatureCollection, keeping each
 * detection's native satellite pixel footprint (as delivered by NOAA —
 * an irregular quadrilateral, not an axis-aligned box) rather than
 * collapsing it to a centroid point. Filtered down to actual wildfire
 * detections.
 */
export function ngfsDetectionsToPolygons(features) {
  return {
    type: 'FeatureCollection',
    features: features
      .filter((f) => WILDFIRE_TYPES.has(f.properties?.type))
      .map((f) => {
        const p = f.properties;
        return {
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            id: p.id,
            latitude: p.latitude,
            longitude: p.longitude,
            frp: p.frp,
            bright_t7: p.bright_t7,
            bright_t13: p.bright_t13,
            confidence: p.confidence,
            satellite: p.satellite,
            acq_date_time: p.acq_date_time,
            pixel_date_time: p.pixel_date_time,
            daynight: p.daynight,
            state: p.state,
            county: p.county,
            known_incident_name: p.known_incident_name,
            type_description: p.type_description,
          },
        };
      }),
  };
}
