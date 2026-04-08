/**
 * nifc.js
 * NIFC / WFIGS – National Interagency Fire Center
 * Fetches active fire perimeters from the public ArcGIS REST endpoint.
 *
 * Endpoint: https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/
 *           WFIGS_Interagency_Perimeters_YTD/FeatureServer/0/query
 *
 * No API key required – this is a public government data service.
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_FIRE_PERIMETERS } from '../data/mockData';

const NIFC_BASE =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services' +
  '/WFIGS_Interagency_Perimeters_YTD/FeatureServer/0/query';

/**
 * Fetch current-year fire perimeters from NIFC WFIGS.
 * @param {object} [opts]
 * @param {number} [opts.minAcres=100]  Filter perimeters below this size
 * @returns {Promise<object>}  GeoJSON FeatureCollection
 */
export async function fetchFirePerimeters({ minAcres = 100 } = {}) {
  const params = new URLSearchParams({
    where: `GISAcres >= ${minAcres}`,
    outFields: [
      'UniqueFireIdentifier', 'IncidentName', 'GISAcres', 'PercentContained',
      'FireDiscoveryDateTime', 'ModifiedOnDateTime', 'POOState', 'POOCounty',
      'IncidentTypeCategory', 'IncidentManagementOrganization',
      'TotalIncidentPersonnel', 'StructuresDestroyed', 'StructuresDamaged',
    ].join(','),
    f: 'geojson',
    outSR: '4326',
    resultRecordCount: 500,
  });

  const url = `${NIFC_BASE}?${params}`;
  const cacheKey = `nifc:perimeters:${minAcres}`;

  try {
    const data = await fetchWithCache(url, cacheKey, {}, 10 * 60 * 1000); // 10-min cache
    if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
    // Return live result even if no perimeters exist yet this season
    if (data?.features) return data;
    throw new Error('Unexpected response format');
  } catch (err) {
    console.warn('[NIFC] Using fallback perimeters:', err.message);
    return MOCK_FIRE_PERIMETERS;
  }
}
