/**
 * firebox.js
 * Firebox intelligence adapter that blends multiple fire-weather sources:
 * - NOAA HRRR (target source, Zarr-first design)
 * - NWS API alerts + forecast grid fallback
 * - NASA FIRMS VIIRS detections with confidence filtering
 */

import { fetchForecastGridFallback, fetchAlertsByPoint } from './noaaWeather';
import { fetchFireHotspots, filterHotspotsByConfidence } from './nasaFirms';

const HRRR_ZARR_AWS_ROOT = 's3://noaa-hrrr-bdp-pds';

function toBoundingBox(lat, lng, radiusDeg = 0.15) {
  return {
    west: lng - radiusDeg,
    south: lat - radiusDeg,
    east: lng + radiusDeg,
    north: lat + radiusDeg,
  };
}

/**
 * Placeholder for HRRR ingestion:
 * architecture is Zarr-first, but the browser client does not currently
 * decode HRRR Zarr chunks directly. We explicitly fall back to NWS grid data.
 */
async function fetchHrrrWeatherAtPoint(_lat, _lng) {
  return {
    source: 'NOAA HRRR (Zarr preferred)',
    zarrRoot: HRRR_ZARR_AWS_ROOT,
    available: false,
    reason: 'Client-side HRRR Zarr decoding not yet enabled; using NWS forecast grid fallback.',
  };
}

export async function fetchFireboxSnapshot(lat, lng, options = {}) {
  const minConfidence = options.minConfidence || 'nominal';
  const [hrrr, nwsFallback, alerts, viirsRaw] = await Promise.all([
    fetchHrrrWeatherAtPoint(lat, lng),
    fetchForecastGridFallback(lat, lng),
    fetchAlertsByPoint(lat, lng),
    fetchFireHotspots(toBoundingBox(lat, lng), 1, 'VIIRS_SNPP_NRT'),
  ]);

  const viirs = filterHotspotsByConfidence(viirsRaw, minConfidence);

  return {
    weather: {
      preferred: hrrr,
      fallback: nwsFallback,
    },
    alerts,
    viirs: {
      detections: viirs,
      minConfidence,
      count: viirs.length,
    },
    futureSources: {
      vegetationDryness: 'NDVI / MODIS (planned)',
      lightning: 'GOES or external lightning API (planned)',
    },
  };
}

