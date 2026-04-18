/**
 * raws.js
 * USFS / WRCC – Remote Automated Weather Stations (RAWS)
 * Public ArcGIS REST endpoint hosted by NIFC.
 *
 * Service: PublicView_RAWS / FeatureServer / 1
 * https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/PublicView_RAWS/FeatureServer/1
 *
 * Confirmed field names (from NIFC Open Data schema):
 *   StationName, WXID, ObservedDate, NESSID, NWSID, Elevation,
 *   SiteDescription, Latitude, Longitude, State, County, Agency,
 *   Region, Unit, SubUnit, Status, RainAccumulation, WindSpeedMPH,
 *   WindDirDegrees, AirTempStandPlace, FuelTemp, RelativeHumidity,
 *   BatteryVoltage, FuelMoisture, WindDirPeak, WindSpeedPeak,
 *   SolarRadiation, StationID, MesoWestStationID, MesoWestURL, NOAA_URL
 */

import { fetchWithCache } from '../utils/dataCache';

const RAWS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services' +
  '/PublicView_RAWS/FeatureServer/1/query' +
  '?where=1%3D1&outFields=*&outSR=4326&f=json';

const CACHE_KEY = 'raws:stations:v3';
const CACHE_TTL = 15 * 60 * 1000;

/** Return first non-null / non-empty value from the candidate keys. */
function pick(attrs, ...keys) {
  for (const k of keys) {
    const v = attrs[k];
    if (v != null && v !== '') return v;
  }
  return null;
}

export async function fetchRAWSStations() {
  const data = await fetchWithCache(RAWS_URL, CACHE_KEY, {}, CACHE_TTL);
  if (data?.error) throw new Error(data.error.message || 'RAWS ArcGIS error');
  if (!Array.isArray(data?.features)) throw new Error('Unexpected RAWS response format');
  return normalizeRAWS(data);
}

function normalizeRAWS(arcgisJson) {
  const features = arcgisJson.features
    .filter(f => f.geometry && f.geometry.x != null && f.geometry.y != null)
    .map(f => {
      const a = f.attributes || {};

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [f.geometry.x, f.geometry.y],
        },
        properties: {
          // Identity
          stationName:   pick(a, 'StationName')   || 'Unknown Station',
          stationId:     String(pick(a, 'StationID', 'WXID', 'NESSID', 'NWSID', 'OBJECTID') ?? Math.random()),
          state:         pick(a, 'State')          || '',
          county:        pick(a, 'County')         || '',
          agency:        pick(a, 'Agency')         || '',
          region:        pick(a, 'Region')         || '',
          unit:          pick(a, 'Unit')           || '',
          status:        pick(a, 'Status')         || '',
          siteDesc:      pick(a, 'SiteDescription') || '',
          elevation:     toNum(pick(a, 'Elevation')),
          noaaUrl:       pick(a, 'NOAA_URL', 'MesoWestURL') || null,

          // Current observations
          observationTime: pick(a, 'ObservedDate'),
          temp:          toNum(pick(a, 'AirTempStandPlace')),
          relHumidity:   toNum(pick(a, 'RelativeHumidity')),
          windSpeed:     toNum(pick(a, 'WindSpeedMPH')),
          windDir:       toNum(pick(a, 'WindDirDegrees')),
          windSpeedPeak: toNum(pick(a, 'WindSpeedPeak')),
          windDirPeak:   toNum(pick(a, 'WindDirPeak')),
          precip:        toNum(pick(a, 'RainAccumulation')),
          fuelMoisture:  toNum(pick(a, 'FuelMoisture')),
          fuelTemp:      toNum(pick(a, 'FuelTemp')),
          solarRadiation: toNum(pick(a, 'SolarRadiation')),
          battery:       toNum(pick(a, 'BatteryVoltage')),
        },
      };
    });

  return { type: 'FeatureCollection', features };
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
