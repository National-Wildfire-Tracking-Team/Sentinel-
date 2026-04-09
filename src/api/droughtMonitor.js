/**
 * droughtMonitor.js
 * US Drought Monitor – Public data from USDA/UNL.
 * No API key required.
 *
 * Endpoint: https://droughtmonitor.unl.edu/data/json/usdm_current.json
 * Or GeoJSON from ArcGIS:
 * https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/
 *   US_Drought_Monitor_Current/FeatureServer/1/query
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_DROUGHT_DATA } from '../data/mockData';

const DROUGHT_ARCGIS =
  'https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services' +
  '/US_Drought_Monitor_Current/FeatureServer/1/query' +
  '?where=1%3D1&outFields=DM%2CDESCRIPT&returnGeometry=true&outSR=4326&f=geojson';

/**
 * Fetch current US drought monitor data.
 * @returns {Promise<object>}  GeoJSON FeatureCollection
 */
export async function fetchDroughtData() {
  const cacheKey = 'drought:current';
  try {
    const data = await fetchWithCache(DROUGHT_ARCGIS, cacheKey, {}, 4 * 60 * 60 * 1000); // 4-hour cache
    if (!data?.features?.length) throw new Error('Empty drought response');
    return data;
  } catch (err) {
    console.warn('[Drought] Using mock drought data:', err.message);
    return MOCK_DROUGHT_DATA;
  }
}
