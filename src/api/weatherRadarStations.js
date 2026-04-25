/**
 * weatherRadarStations.js
 * NOAA NWS Radar Stations via the api.weather.gov REST API.
 *
 * Endpoint: https://api.weather.gov/radar/stations
 * Returns GeoJSON FeatureCollection with live operational status for every
 * NEXRAD (WSR-88D) and TDWR station in the US network.
 *
 * The same domain is used for weather alerts throughout the app, so this
 * endpoint is already CORS-safe for browser requests.
 *
 * AWS Open Data rider: Level II archive and real-time data for every NEXRAD
 * site is freely available on Amazon S3 via the NOAA NEXRAD on AWS open data
 * programme: https://registry.opendata.aws/noaa-nexrad/
 * Bucket: s3://unidata-nexrad-level2  (us-east-1, no credentials required)
 */

import { fetchWithCache } from '../utils/dataCache';

const STATIONS_URL = 'https://api.weather.gov/radar/stations';
const CACHE_KEY    = 'noaa:radar-stations:v2';
const CACHE_TTL    = 5 * 60 * 1000; // 5 min – includes live operational status

export async function fetchWeatherRadarStations() {
  const data = await fetchWithCache(
    STATIONS_URL,
    CACHE_KEY,
    { headers: { Accept: 'application/geo+json' } },
    CACHE_TTL,
  );

  if (!Array.isArray(data?.features)) {
    throw new Error('Unexpected radar stations response format');
  }

  return normalize(data);
}

function normalize(geojson) {
  const features = geojson.features
    .filter(f => {
      const [lng, lat] = f.geometry?.coordinates ?? [];
      return lng != null && lat != null;
    })
    .map(f => {
      const p   = f.properties || {};
      const rda = p.rda?.properties || {};

      // stationType is "WSR-88D" (NEXRAD) or "TDWR"
      const isNexrad = p.stationType === 'WSR-88D';
      const radarType = isNexrad ? 'NEXRAD' : (p.stationType || 'NEXRAD');

      // Elevation comes in metres from this API
      const elevM = p.elevation?.value ?? null;
      const elevFt = elevM != null ? Math.round(elevM * 3.28084) : null;

      // Live status
      const status    = rda.operabilityStatus || rda.status || null;
      const mode      = rda.mode             || null;
      const vcp       = rda.volumeCoveragePattern || null;
      const lastScan  = p.latency?.levelTwoLastReceivedTime || null;

      return {
        type: 'Feature',
        geometry: {
          type:        'Point',
          coordinates: f.geometry.coordinates,
        },
        properties: {
          id:              p.id    || String(Math.random()),
          siteId:          p.id   || '',
          siteName:        p.name || 'Unknown',
          radarType,
          antennaElevation: elevFt,
          status,
          mode,
          vcp,
          lastScan,
        },
      };
    });

  return { type: 'FeatureCollection', features };
}
