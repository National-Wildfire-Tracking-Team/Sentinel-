/**
 * weatherRadarStations.js
 * NOAA NEXRAD and TDWR weather radar station locations.
 * Public ArcGIS FeatureServer hosted by NOAA Office for Coastal Management.
 *
 * Service: Hosted/WeatherRadarStations / FeatureServer / 0
 * https://coast.noaa.gov/arcgis/rest/services/Hosted/WeatherRadarStations/FeatureServer
 *
 * Fields:
 *   siteidentifier  – 4-char ICAO radar site ID (e.g. KABR)
 *   sitename        – human-readable city/location name
 *   radartype       – "NEXRAD" or "TDWR"
 *   antennaelevation – feet above mean sea level (nullable)
 *
 * No API key required – public government data.
 */

import { fetchWithCache } from '../utils/dataCache';

const BASE_URL =
  'https://coast.noaa.gov/arcgis/rest/services/Hosted/WeatherRadarStations/FeatureServer/0/query';

const QUERY_PARAMS =
  '?where=1%3D1&outFields=siteidentifier,sitename,radartype,antennaelevation,objectid' +
  '&outSR=4326&f=geojson&resultRecordCount=1000';

const RADAR_URL   = BASE_URL + QUERY_PARAMS;
const CACHE_KEY   = 'noaa:radar-stations:v1';
const CACHE_TTL   = 24 * 60 * 60 * 1000; // stations are static – refresh once per day

export async function fetchWeatherRadarStations() {
  const data = await fetchWithCache(RADAR_URL, CACHE_KEY, {}, CACHE_TTL);

  if (data?.error) {
    throw new Error(data.error.message || 'Weather Radar Stations ArcGIS error');
  }

  if (!Array.isArray(data?.features)) {
    throw new Error('Unexpected Weather Radar Stations response format');
  }

  return normalize(data);
}

function normalize(geojson) {
  const features = geojson.features
    .filter(f => f.geometry?.coordinates?.length === 2)
    .map(f => {
      const p = f.properties || {};
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: f.geometry.coordinates,
        },
        properties: {
          id:               String(p.objectid ?? Math.random()),
          siteId:           p.siteidentifier || '',
          siteName:         p.sitename       || 'Unknown',
          radarType:        p.radartype      || 'NEXRAD',
          antennaElevation: p.antennaelevation != null ? Number(p.antennaelevation) : null,
        },
      };
    });

  return { type: 'FeatureCollection', features };
}
