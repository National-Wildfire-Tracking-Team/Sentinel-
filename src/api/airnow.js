/**
 * airnow.js
 * AirNow API – EPA Air Quality Index data.
 * Free API key at: https://docs.airnowapi.org/login
 *
 * Without a key, returns mock AQI station data.
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_AQI_STATIONS } from '../data/mockData';

const AIRNOW_BASE = 'https://www.airnowapi.org/aq/observation/latLon/current/';
const API_KEY = import.meta.env.VITE_AIRNOW_API_KEY;

/**
 * Fetch AQI observations for a bounding box by sampling a grid of points.
 * AirNow's public endpoint supports single lat/lon + distance queries.
 * For production, use their bounding box endpoint or ArcGIS Feature Service.
 *
 * @param {object} bounds  { west, south, east, north }
 * @returns {Promise<Array>}  Array of AQI station objects
 */
export async function fetchAQIStations(bounds = {}) {
  if (!API_KEY || API_KEY === 'your_airnow_api_key_here') {
    console.info('[AirNow] No API key – using demo data');
    return MOCK_AQI_STATIONS;
  }

  // AirNow ArcGIS FeatureServer (public, no key needed for basic data)
  const arcgisUrl =
    'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services' +
    '/AirNowLatestContoursCombined/FeatureServer/0/query?' +
    new URLSearchParams({
      where: '1=1',
      outFields: '*',
      f: 'geojson',
      resultRecordCount: 500,
    });

  const cacheKey = 'airnow:stations';

  try {
    const data = await fetchWithCache(arcgisUrl, cacheKey, {}, 15 * 60 * 1000);
    if (!data?.features?.length) throw new Error('Empty response');
    return normalizeAQIStations(data.features);
  } catch (err) {
    console.warn('[AirNow] Using mock AQI data:', err.message);
    return MOCK_AQI_STATIONS;
  }
}

function normalizeAQIStations(features) {
  return features.map((f, i) => ({
    id: `aqi-${i}`,
    latitude:      f.geometry?.coordinates?.[1] ?? 0,
    longitude:     f.geometry?.coordinates?.[0] ?? 0,
    aqi:           f.properties?.AQI ?? f.properties?.aqi ?? 0,
    category:      f.properties?.Category?.Name ?? 'Unknown',
    pm25:          f.properties?.['PM2.5'] ?? 0,
    reportingArea: f.properties?.ReportingArea ?? f.properties?.Name ?? '',
  }));
}

/**
 * Convert array of AQI stations to GeoJSON FeatureCollection.
 */
export function aqiToGeoJSON(stations) {
  return {
    type: 'FeatureCollection',
    features: stations.map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: {
        id:            s.id,
        aqi:           s.aqi,
        category:      s.category,
        pm25:          s.pm25,
        reportingArea: s.reportingArea,
      },
    })),
  };
}
