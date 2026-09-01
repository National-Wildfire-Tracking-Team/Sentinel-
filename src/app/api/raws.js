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

const CACHE_KEY = 'raws:stations:v4';
const CACHE_TTL = 15 * 60 * 1000;

/** Return the first non-null/non-empty value found from the candidate keys. */
function pick(attrs, ...keys) {
  for (const k of keys) {
    const v = attrs[k];
    if (v != null && v !== '') return v;
  }
  return null;
}

/**
 * Case-insensitive substring scan – last resort when explicit keys miss.
 * Returns the first attribute value whose key contains `fragment`.
 */
function pickCI(attrs, fragment) {
  const lc = fragment.toLowerCase();
  for (const [k, v] of Object.entries(attrs)) {
    if (k.toLowerCase().includes(lc) && v != null && v !== '') return v;
  }
  return null;
}

export async function fetchRAWSStations() {
  const data = await fetchWithCache(RAWS_URL, CACHE_KEY, {}, CACHE_TTL);
  if (data?.error) throw new Error(data.error.message || 'RAWS ArcGIS error');
  if (!Array.isArray(data?.features)) throw new Error('Unexpected RAWS response format');
  return normalizeRAWS(data);
}

let _fieldsDumped = false;

function normalizeRAWS(arcgisJson) {
  if (!_fieldsDumped && arcgisJson.features.length > 0) {
    _fieldsDumped = true;
    console.log('[RAWS] Raw attribute keys:', Object.keys(arcgisJson.features[0].attributes || {}));
    console.log('[RAWS] Sample values:', arcgisJson.features[0].attributes);
  }

  const features = arcgisJson.features
    .filter(f => f.geometry && f.geometry.x != null && f.geometry.y != null)
    .map(f => {
      const a = f.attributes || {};

      const stationName = pick(a,
        'StationName', 'STATION_NAME', 'station_name',
        'STA_NAME', 'SITE_NAME', 'SiteName', 'NAME', 'Name',
      ) || 'Unknown Station';

      const stationId = pick(a,
        'StationID', 'WXID', 'NESSID', 'NWSID',
        'NWSLI', 'STATION_ID', 'SITE_ID', 'OBJECTID', 'FID',
      ) || String(Math.random());

      const elevation = pick(a,
        'Elevation', 'ELEVATION', 'elevation',
        'ELEV', 'Elev', 'elev', 'ELEV_FT',
      );

      // Temperature (°F)
      const temp = pick(a,
        'AirTempStandPlace',
        'TEMP', 'Temp', 'temp',
        'AIR_TEMP', 'AirTemp', 'air_temp',
        'TMPF', 'TEMP_F', 'TempF',
        'TEMPERATURE', 'Temperature',
      ) ?? pickCI(a, 'airtemp') ?? pickCI(a, 'temp');

      // Relative Humidity (%)
      const relHumidity = pick(a,
        'RelativeHumidity',
        'RELH', 'relh',
        'RH', 'rh',
        'REL_HUMIDITY', 'rel_humidity',
        'HUMIDITY', 'Humidity',
      ) ?? pickCI(a, 'humid') ?? pickCI(a, 'relh');

      // Wind speed (mph)
      const windSpeed = pick(a,
        'WindSpeedMPH',
        'WSPD', 'wspd',
        'WIND_SPEED', 'WindSpeed', 'wind_speed',
        'WIND_SPD', 'WindSpd',
        'WINDMPH', 'WindMPH',
        'AVGWINDSPD', 'AvgWindSpd',
      ) ?? pickCI(a, 'windsp') ?? pickCI(a, 'wspd');

      // Wind direction (degrees)
      const windDir = pick(a,
        'WindDirDegrees',
        'WDIR', 'wdir',
        'WIND_DIR', 'WindDir', 'wind_dir',
        'WIND_DIRECTION', 'WindDirection',
        'AVGWINDDIR', 'AvgWindDir',
      ) ?? pickCI(a, 'winddi') ?? pickCI(a, 'wdir');

      // Peak wind
      const windSpeedPeak = pick(a, 'WindSpeedPeak', 'WIND_SPD_PEAK', 'WindSpdPeak', 'PEAK_WIND_SPD') ?? null;
      const windDirPeak   = pick(a, 'WindDirPeak',   'WIND_DIR_PEAK', 'WindDirPeak')                  ?? null;

      // Precipitation (inches)
      const precip = pick(a,
        'RainAccumulation',
        'PRECIP', 'Precip', 'precip',
        'PRCP', 'RAIN', 'Rain',
      ) ?? pickCI(a, 'rain') ?? pickCI(a, 'prec');

      // Fuel moisture / temp
      const fuelMoisture = pick(a, 'FuelMoisture', 'FUEL_MOISTURE', 'fuel_moisture', 'FM10') ?? pickCI(a, 'fuel');
      const fuelTemp     = pick(a, 'FuelTemp', 'FUEL_TEMP', 'fuel_temp') ?? null;

      // Other sensors
      const solarRadiation = pick(a, 'SolarRadiation', 'SOLAR', 'solar') ?? null;
      const battery        = pick(a, 'BatteryVoltage', 'BATTERY', 'battery') ?? null;

      // Observation timestamp
      const observationTime = pick(a,
        'ObservedDate',
        'OBSERVATION_DATE', 'ObservationDate',
        'OBS_DATE', 'ObsDate',
        'DATE_TIME', 'DateTime',
        'REPORT_DATE', 'ReportDate',
      ) ?? pickCI(a, 'obs') ?? pickCI(a, 'date');

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [f.geometry.x, f.geometry.y],
        },
        properties: {
          stationName,
          stationId:     String(stationId),
          state:         pick(a, 'State', 'STATE', 'state', 'ST') || '',
          county:        pick(a, 'County', 'COUNTY', 'county')    || '',
          agency:        pick(a, 'Agency', 'AGENCY', 'agency')    || '',
          region:        pick(a, 'Region', 'REGION', 'region')    || '',
          unit:          pick(a, 'Unit',   'UNIT',   'unit')      || '',
          status:        pick(a, 'Status', 'STATUS', 'status')    || '',
          siteDesc:      pick(a, 'SiteDescription', 'SITE_DESC')  || '',
          elevation:     toNum(elevation),
          noaaUrl:       pick(a, 'NOAA_URL', 'MesoWestURL')       || null,
          observationTime,
          temp:          toNum(temp),
          relHumidity:   toNum(relHumidity),
          windSpeed:     toNum(windSpeed),
          windDir:       toNum(windDir),
          windSpeedPeak: toNum(windSpeedPeak),
          windDirPeak:   toNum(windDirPeak),
          precip:        toNum(precip),
          fuelMoisture:  toNum(fuelMoisture),
          fuelTemp:      toNum(fuelTemp),
          solarRadiation: toNum(solarRadiation),
          battery:       toNum(battery),
        },
      };
    });

  return { type: 'FeatureCollection', features };
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
