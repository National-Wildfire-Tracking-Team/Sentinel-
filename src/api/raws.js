/**
 * raws.js
 * USFS / WRCC – Remote Automated Weather Stations (RAWS)
 * Public ArcGIS REST endpoint hosted by NIFC.
 */

import { fetchWithCache } from '../utils/dataCache';

const BASE_URL = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/PublicView_RAWS/FeatureServer/1/query';
const CACHE_KEY_PREFIX = 'raws:stations:v3';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/** Return first non-null / non-empty value from the candidate keys. */
function pick(attrs, ...keys) {
  for (const k of keys) {
    const v = attrs[k];
    if (v != null && v !== '') return v;
  }
  return null;
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function fetchRAWSStations() {
  let allArcGisFeatures = [];
  let offset = 0;
  let hasMore = true;

  // ArcGIS Pagination Loop: Keep fetching until 'exceededTransferLimit' is false/undefined
  while (hasMore) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      outSR: '4326', // Requesting WGS84 coordinates
      f: 'json',
      resultOffset: offset.toString()
    });

    const url = `${BASE_URL}?${params.toString()}`;
    const cacheKey = `${CACHE_KEY_PREFIX}:offset:${offset}`;

    const data = await fetchWithCache(url, cacheKey, {}, CACHE_TTL);

    if (data?.error) throw new Error(data.error.message || 'RAWS ArcGIS error');
    if (!Array.isArray(data?.features)) throw new Error('Unexpected RAWS response format');

    allArcGisFeatures = allArcGisFeatures.concat(data.features);

    if (data.exceededTransferLimit) {
      offset += data.features.length;
    } else {
      hasMore = false;
    }
  }

  return normalizeRAWS(allArcGisFeatures);
}

function normalizeRAWS(arcgisFeatures) {
  const features = arcgisFeatures
    .filter(f => f.geometry && f.geometry.x != null && f.geometry.y != null)
    .map(f => {
      const a = f.attributes || {};

      // Parse ArcGIS Epoch timestamps to ISO strings
      const rawDate = pick(a, 'ObservedDate');
      const obsTime = rawDate ? new Date(rawDate).toISOString() : null;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          // GeoJSON standard dictates [Longitude, Latitude]
          coordinates: [Number(f.geometry.x), Number(f.geometry.y)],
        },
        properties: {
          // Identity
          stationName: pick(a, 'StationName') || 'Unknown Station',
          // OBJECTID is guaranteed by ArcGIS to be unique and stable
          stationId: String(pick(a, 'OBJECTID', 'StationID', 'WXID') ?? Math.random()),
          state: pick(a, 'State') || '',
          county: pick(a, 'County') || '',
          agency: pick(a, 'Agency') || '',
          region: pick(a, 'Region') || '',
          unit: pick(a, 'Unit') || '',
          status: pick(a, 'Status') || '',
          siteDesc: pick(a, 'SiteDescription') || '',
          elevation: toNum(pick(a, 'Elevation')),
          noaaUrl: pick(a, 'NOAA_URL', 'MesoWestURL') || null,

          // Current observations
          observationTime: obsTime,
          temp: toNum(pick(a, 'AirTempStandPlace')),
          relHumidity: toNum(pick(a, 'RelativeHumidity')),
          windSpeed: toNum(pick(a, 'WindSpeedMPH')),
          windDir: toNum(pick(a, 'WindDirDegrees')),
          windSpeedPeak: toNum(pick(a, 'WindSpeedPeak')),
          windDirPeak: toNum(pick(a, 'WindDirPeak')),
          precip: toNum(pick(a, 'RainAccumulation')),
          fuelMoisture: toNum(pick(a, 'FuelMoisture')),
          fuelTemp: toNum(pick(a, 'FuelTemp')),
          solarRadiation: toNum(pick(a, 'SolarRadiation')),
          battery: toNum(pick(a, 'BatteryVoltage')),
        },
      };
    });

  return { type: 'FeatureCollection', features };
}
