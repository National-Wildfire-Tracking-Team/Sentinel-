/**
 * californiaCameras.js
 * Live California highway CCTV cameras — Caltrans District CCTV network,
 * fetched directly from cwwp2.dot.ca.gov (public, no key required, open
 * CORS). Same underlying camera network scraped by tools like the archived
 * a3r0id/california-live-cams project.
 *
 * Caltrans publishes one JSON file per district (12 total); fetch them all
 * in parallel and merge into a single GeoJSON FeatureCollection.
 */

import { getCached, setCached } from '../utils/dataCache';

const HEADERS = { Accept: 'application/json' };
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_KEY = 'caltrans-cctv-cameras';
const DISTRICTS = Array.from({ length: 12 }, (_, i) => i + 1);

function districtUrl(d) {
  const padded = String(d).padStart(2, '0');
  return `https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${padded}.json`;
}

/** Convert one Caltrans cctvStatus entry into our GeoJSON feature shape. */
function cameraToFeature(entry) {
  const c = entry?.cctv;
  if (!c) return null;

  const loc = c.location ?? {};
  const lat = Number(loc.latitude);
  const lon = Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;

  const inService = String(c.inService).toLowerCase() === 'true';

  const img = c.imageData ?? {};
  const staticImg = img.static ?? {};
  const imageUrl = staticImg.currentImageURL || null;

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id: `${loc.district}-${c.index}`,
      name: loc.locationName || img.imageDescription || 'Caltrans Camera',
      nearbyPlace: loc.nearbyPlace || null,
      route: loc.route || null,
      direction: loc.direction || null,
      county: loc.county || null,
      district: loc.district || null,
      imageUrl,
      streamUrl: img.streamingVideoURL || null,
      updateFrequencyMin: Number(staticImg.currentImageUpdateFrequency) || null,
      inService,
    },
  };
}

/**
 * Fetch all Caltrans CCTV camera locations across all 12 districts,
 * in-service and down alike (each feature carries `inService` so the map
 * can mark down cameras rather than hiding them). A successful, non-empty
 * result is cached for 5 minutes; empty/failed responses are never cached
 * so a transient outage (or one district failing) doesn't blank the map.
 */
export async function fetchCaliforniaCameras() {
  const cached = getCached(CACHE_KEY);
  if (cached) return cached;

  const results = await Promise.allSettled(
    DISTRICTS.map((d) => fetch(districtUrl(d), { headers: HEADERS }).then((r) => (r.ok ? r.json() : null)))
  );

  const features = [];
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    const rawEntries = Array.isArray(result.value?.data) ? result.value.data : [];
    for (const entry of rawEntries) {
      const feature = cameraToFeature(entry);
      if (feature) features.push(feature);
    }
  }

  const geoJSON = { type: 'FeatureCollection', features };
  if (features.length > 0) setCached(CACHE_KEY, geoJSON, CACHE_TTL);
  return geoJSON;
}
