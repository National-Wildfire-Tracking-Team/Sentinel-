/**
 * raws.js
 * USFS / WRCC – Remote Automated Weather Stations (RAWS)
 * Public ArcGIS REST endpoint hosted by NIFC.
 *
 * Service: PublicView_RAWS / FeatureServer / 1
 * https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/PublicView_RAWS/FeatureServer/1
 *
 * No API key required – public government data service.
 */

import { fetchWithCache } from '../utils/dataCache';

const RAWS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services' +
  '/PublicView_RAWS/FeatureServer/1/query' +
  '?where=1%3D1&outFields=*&outSR=4326&f=json';

const CACHE_KEY = 'raws:stations';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch RAWS weather station data and return as GeoJSON FeatureCollection.
 * @returns {Promise<GeoJSON.FeatureCollection>}
 */
export async function fetchRAWSStations() {
  const data = await fetchWithCache(RAWS_URL, CACHE_KEY, {}, CACHE_TTL);

  if (data?.error) {
    throw new Error(data.error.message || 'RAWS ArcGIS error');
  }
  if (!Array.isArray(data?.features)) {
    throw new Error('Unexpected RAWS response format');
  }

  return normalizeRAWS(data);
}

/**
 * Convert ArcGIS JSON (f=json) to GeoJSON and normalize attribute names.
 */
function normalizeRAWS(arcgisJson) {
  const features = arcgisJson.features
    .filter(f => f.geometry && f.geometry.x != null && f.geometry.y != null)
    .map(f => {
      const a = f.attributes || {};

      // Station identifiers
      const stationName =
        a.STATION_NAME || a.StationName || a.NAME || a.name || 'Unknown Station';
      const stationId =
        a.NWSLI || a.StationID || a.STATION_ID || a.OBJECTID || String(Math.random());
      const state =
        a.STATE || a.State || a.state || '';
      const elevation =
        a.ELEVATION || a.Elevation || a.ELEV || a.elev || null;

      // Current weather observations (field names vary by RAWS network)
      const temp =
        a.TEMP || a.Temp || a.AIR_TEMP || a.air_temp || null;
      const relHumidity =
        a.RELH || a.RelativeHumidity || a.RH || a.rel_humidity || null;
      const windSpeed =
        a.WSPD || a.WindSpeed || a.WIND_SPD || a.wind_spd || null;
      const windDir =
        a.WDIR || a.WindDir || a.WIND_DIR || a.wind_dir || null;
      const precip =
        a.PRCP || a.Precip || a.PRECIPITATION || a.precipitation || null;
      const fuelMoisture =
        a.FM10 || a.FuelMoisture || a.fuel_moisture || null;
      const observationTime =
        a.OBSERVATION_DATE || a.ObservationDate || a.DATE_TIME ||
        a.last_observation || a.LAST_OBSERVATION || null;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [f.geometry.x, f.geometry.y],
        },
        properties: {
          id: String(stationId),
          stationName,
          stationId: String(stationId),
          state,
          elevation: elevation != null ? Number(elevation) : null,
          temp: temp != null ? Number(temp) : null,
          relHumidity: relHumidity != null ? Number(relHumidity) : null,
          windSpeed: windSpeed != null ? Number(windSpeed) : null,
          windDir: windDir != null ? Number(windDir) : null,
          precip: precip != null ? Number(precip) : null,
          fuelMoisture: fuelMoisture != null ? Number(fuelMoisture) : null,
          observationTime,
          // Pass through all raw attributes for detail panels
          _raw: a,
        },
      };
    });

  return { type: 'FeatureCollection', features };
}
