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

const CACHE_KEY = 'raws:stations:v2'; // v2 – updated field mapping
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ── Field resolution helpers ──────────────────────────────────────────────────

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

// ── Main fetch ────────────────────────────────────────────────────────────────

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

// ── Normalizer ────────────────────────────────────────────────────────────────

let _fieldsDumped = false;

/**
 * Convert ArcGIS JSON (f=json) → GeoJSON and resolve attribute field names.
 * The PublicView_RAWS service field names are not publicly documented; we try
 * every known variant then fall back to a case-insensitive substring scan so
 * data survives any future schema change.
 */
function normalizeRAWS(arcgisJson) {
  // One-time diagnostic: log raw field names on the first successful load.
  if (!_fieldsDumped && arcgisJson.features.length > 0) {
    _fieldsDumped = true;
    console.log(
      '[RAWS] Raw attribute keys:',
      Object.keys(arcgisJson.features[0].attributes || {}),
    );
    console.log(
      '[RAWS] Sample values:',
      arcgisJson.features[0].attributes,
    );
  }

  const features = arcgisJson.features
    .filter(f => f.geometry && f.geometry.x != null && f.geometry.y != null)
    .map(f => {
      const a = f.attributes || {};

      // ── Station identity ──────────────────────────────────────────────────
      const stationName = pick(a,
        'STATION_NAME', 'StationName', 'station_name',
        'STA_NAME', 'sta_name', 'SITE_NAME', 'SiteName', 'site_name',
        'NAME', 'Name', 'name', 'LABEL', 'Label',
      ) || 'Unknown Station';

      const stationId = pick(a,
        'NWSLI', 'nwsli', 'STATION_ID', 'StationID', 'station_id',
        'STA_ID', 'SITE_ID', 'SiteID', 'site_id',
        'OBJECTID', 'ObjectID', 'FID',
      ) || String(Math.random());

      const state = pick(a,
        'STATE', 'State', 'state', 'ST', 'St',
      ) || '';

      const elevation = pick(a,
        'ELEVATION', 'Elevation', 'elevation',
        'ELEV', 'Elev', 'elev',
        'ELEV_FT', 'elev_ft', 'ALTITUDE', 'altitude',
      );

      // ── Current weather observations ──────────────────────────────────────
      // Temperature – Fahrenheit preferred; some services serve Celsius (TC)
      const temp = pick(a,
        // WIMS / NFDRS codes
        'TEMP', 'Temp', 'temp',
        // ArcGIS service variants
        'AIR_TEMP', 'AirTemp', 'air_temp',
        'TEMP_AIR', 'TempAir', 'temp_air',
        'TMPF', 'TmpF', 'TEMP_F', 'TempF', 'temp_f',
        'AIRTEMP', 'AirTemperature', 'air_temperature',
        'TEMPERATURE', 'Temperature', 'temperature',
        'OBS_TEMP', 'obs_temp',
        // Celsius variants (less common for US RAWS)
        'TEMPC', 'TempC', 'temp_c', 'TEMPC_INSTANT',
      ) ?? pickCI(a, 'temp');

      // Relative Humidity
      const relHumidity = pick(a,
        // WIMS codes
        'RELH', 'Relh', 'relh',
        // ArcGIS variants
        'RH', 'Rh', 'rh',
        'REL_HUM', 'RelHum', 'rel_hum',
        'REL_HUMIDITY', 'RelHumidity', 'rel_humidity',
        'RELATIVE_HUMIDITY', 'RelativeHumidity', 'relative_humidity',
        'RHPCT', 'RHPct', 'rh_pct',
        'HUMIDITY', 'Humidity', 'humidity',
        'OBS_RH', 'obs_rh',
      ) ?? pickCI(a, 'humid') ?? pickCI(a, 'relh') ?? pickCI(a, '_rh');

      // Wind speed (mph preferred)
      const windSpeed = pick(a,
        // WIMS codes
        'WSPD', 'Wspd', 'wspd',
        // ArcGIS variants
        'WIND_SPD', 'WindSpd', 'wind_spd',
        'WIND_SPEED', 'WindSpeed', 'wind_speed',
        'WINDSPEED', 'windspeed',
        'WIND_SPD_MPH', 'WindSpdMPH', 'wind_spd_mph',
        'WINDMPH', 'WindMPH', 'wind_mph',
        'WND_SPD', 'WndSpd', 'wnd_spd',
        'OBS_WIND_SPD', 'obs_wind_spd',
        'WIND', 'Wind', 'wind',
        'WNDSPD', 'WndSpd',
        'AVGWINDSPD', 'AvgWindSpd',
      ) ?? pickCI(a, 'wspd') ?? pickCI(a, 'windsp') ?? pickCI(a, 'wind_s');

      // Wind direction (degrees, 0-360)
      const windDir = pick(a,
        // WIMS codes
        'WDIR', 'Wdir', 'wdir',
        // ArcGIS variants
        'WIND_DIR', 'WindDir', 'wind_dir',
        'WIND_DIRECTION', 'WindDirection', 'wind_direction',
        'WINDDIR', 'winddir',
        'WIND_DIR_DEG', 'WindDirDeg', 'wind_dir_deg',
        'WND_DIR', 'WndDir', 'wnd_dir',
        'OBS_WIND_DIR', 'obs_wind_dir',
        'DRCT', 'Drct', 'drct',
        'WNDDIR', 'WndDir',
        'AVGWINDDIR', 'AvgWindDir',
      ) ?? pickCI(a, 'wdir') ?? pickCI(a, 'winddi') ?? pickCI(a, 'wind_d');

      // Precipitation (inches)
      const precip = pick(a,
        'PRCP', 'Prcp', 'prcp',
        'PRECIP', 'Precip', 'precip',
        'PRECIPITATION', 'Precipitation', 'precipitation',
        'RAIN', 'Rain', 'rain',
        'P01I', 'P01M', 'PSUM',
        'PCPN', 'Pcpn', 'pcpn',
      ) ?? pickCI(a, 'prec') ?? pickCI(a, 'rain');

      // 10-hr fuel moisture (%)
      const fuelMoisture = pick(a,
        'FM10', 'Fm10', 'fm10',
        'FUEL_MOISTURE', 'FuelMoisture', 'fuel_moisture',
        'FUELMOISTPCT', 'FuelMoistPct',
        '10HR_FM', 'TenHrFM',
        'MOIST', 'Moist', 'moist',
      ) ?? pickCI(a, 'fuel') ?? pickCI(a, 'fm10') ?? pickCI(a, 'moisture');

      // Observation timestamp
      const observationTime = pick(a,
        'OBSERVATION_DATE', 'ObservationDate', 'observation_date',
        'OBS_DATE', 'ObsDate', 'obs_date',
        'OBSDATE', 'ObsDate', 'obsdate',
        'DATE_TIME', 'DateTime', 'date_time',
        'DATETIME', 'Datetime', 'datetime',
        'LAST_OBSERVATION', 'LastObservation', 'last_observation',
        'OBS_TIME', 'ObsTime', 'obs_time',
        'REPORT_DATE', 'ReportDate', 'report_date',
        'RAWS_DATE', 'RawsDate',
      ) ?? pickCI(a, 'obs') ?? pickCI(a, 'date');

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [f.geometry.x, f.geometry.y],
        },
        properties: {
          id:             String(stationId),
          stationName,
          stationId:      String(stationId),
          state,
          elevation:      elevation != null ? Number(elevation)    : null,
          temp:           temp      != null ? Number(temp)         : null,
          relHumidity:    relHumidity != null ? Number(relHumidity) : null,
          windSpeed:      windSpeed != null ? Number(windSpeed)    : null,
          windDir:        windDir   != null ? Number(windDir)      : null,
          precip:         precip    != null ? Number(precip)       : null,
          fuelMoisture:   fuelMoisture != null ? Number(fuelMoisture) : null,
          observationTime,
        },
      };
    });

  return { type: 'FeatureCollection', features };
}
