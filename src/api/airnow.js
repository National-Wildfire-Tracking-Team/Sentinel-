/**
 * airnow.js
 * AirNow API – EPA Air Quality Index data.
 *
 * Primary source: AirNow ArcGIS FeatureServer (public, no key required).
 * Fallback: AirNow private API proxied through the Supabase `airnow-proxy`
 *   edge function so the API key never touches the browser.
 *   Deploy secret: supabase secrets set AIRNOW_API_KEY=<your_key>
 *
 * Without Supabase configured, returns mock AQI station data.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { fetchWithCache } from '../utils/dataCache';
import { MOCK_AQI_STATIONS } from '../data/mockData';

/**
 * Fetch AQI observations for a bounding box by sampling a grid of points.
 * AirNow's public endpoint supports single lat/lon + distance queries.
 * For production, use their bounding box endpoint or ArcGIS Feature Service.
 *
 * @param {object} bounds  { west, south, east, north }
 * @returns {Promise<Array>}  Array of AQI station objects
 */
export async function fetchAQIStations(bounds = {}) {
  // AirNow ArcGIS FeatureServer – public endpoint, no API key required
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
    // Fall back to AirNow private API via Supabase edge function
    if (isSupabaseConfigured) {
      try {
        const { data: data2, error } = await supabase.functions.invoke('airnow-proxy', {
          body: { lat: 39.5, lon: -98.35, distance: 200 },
        });
        if (!error && Array.isArray(data2) && data2.length) {
          return normalizeAQIPrivate(data2);
        }
      } catch (err2) {
        console.warn('[AirNow] Private API fallback also failed:', err2.message);
      }
    }
    console.warn('[AirNow] Using fallback data:', err.message);
    return MOCK_AQI_STATIONS;
  }
}

function normalizeAQIPrivate(records) {
  return records.map((r, i) => ({
    id: `aqi-${i}`,
    latitude:      r.Latitude ?? 0,
    longitude:     r.Longitude ?? 0,
    aqi:           r.AQI ?? 0,
    category:      r.Category?.Name ?? 'Unknown',
    pm25:          r.ParameterName === 'PM2.5' ? r.AQI : 0,
    reportingArea: r.ReportingArea ?? '',
  }));
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

// ─── AirNow Monitor Data (individual sensor readings) ─────────────────────────

const AIRNOW_MONITOR_URL =
  'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services' +
  '/Air_Now_Monitor_Data_Public/FeatureServer/0/query';

/**
 * Fetch AirNow monitor point data (individual sensor stations with PM2.5,
 * PM10, Ozone AQI readings) from the public ArcGIS FeatureServer.
 * Returns a GeoJSON FeatureCollection ready for Mapbox.
 */
export async function fetchAirNowMonitors() {
  const params = new URLSearchParams({
    where: "CountryCode='US' OR CountryCode='CA'",
    outFields: 'AQSID,SiteName,StateName,Status,PM25_AQI,PM25_AQI_LABEL,PM10_AQI,PM10_AQI_LABEL,OZONE_AQI,OZONE_AQI_LABEL,OZONEPM_AQI,OZONEPM_AQI_LABEL,PM_AQI,PM_AQI_LABEL,Latitude,Longitude,LocalTimeString,MonitorType',
    outSR: '4326',
    f: 'json',
    resultRecordCount: '5000',
  });

  const cacheKey = 'airnow:monitors';
  const url = `${AIRNOW_MONITOR_URL}?${params}`;

  const data = await fetchWithCache(url, cacheKey, {}, 15 * 60 * 1000);

  if (!data?.features?.length) {
    throw new Error('Empty monitor response');
  }

  return esriToMonitorGeoJSON(data.features);
}

function esriToMonitorGeoJSON(features) {
  const geojsonFeatures = features
    .filter(f => f.geometry && f.geometry.x != null && f.geometry.y != null)
    .map(f => {
      const a = f.attributes;
      // Primary AQI: combined Ozone+PM if available, otherwise whichever is present
      const primaryAqi = a.OZONEPM_AQI ?? a.PM_AQI ?? a.PM25_AQI ?? a.OZONE_AQI ?? null;
      const primaryLabel = a.OZONEPM_AQI_LABEL ?? a.PM_AQI_LABEL ?? a.PM25_AQI_LABEL ?? a.OZONE_AQI_LABEL ?? 'ND';

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [f.geometry.x, f.geometry.y],
        },
        properties: {
          aqsid:       a.AQSID ?? '',
          siteName:    a.SiteName ?? '',
          stateName:   a.StateName ?? '',
          status:      a.Status ?? '',
          aqi:         primaryAqi,
          aqiLabel:    primaryLabel,
          pm25Aqi:     a.PM25_AQI ?? null,
          pm25Label:   a.PM25_AQI_LABEL ?? 'ND',
          pm10Aqi:     a.PM10_AQI ?? null,
          pm10Label:   a.PM10_AQI_LABEL ?? 'ND',
          ozoneAqi:    a.OZONE_AQI ?? null,
          ozoneLabel:  a.OZONE_AQI_LABEL ?? 'ND',
          pmAqi:       a.PM_AQI ?? null,
          pmLabel:     a.PM_AQI_LABEL ?? 'ND',
          localTime:   a.LocalTimeString ?? '',
          monitorType: a.MonitorType ?? '',
        },
      };
    });

  return { type: 'FeatureCollection', features: geojsonFeatures };
}

// ─── AQI GeoJSON helper ────────────────────────────────────────────────────────

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
