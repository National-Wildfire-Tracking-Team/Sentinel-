/**
 * nifc.js
 * NIFC / WFIGS – National Interagency Fire Center
 * Fetches year-to-date fire perimeters from the public ArcGIS REST endpoint.
 *
 * Service: WFIGS_Interagency_Perimeters_YearToDate
 * https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/
 *   WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query
 *
 * No API key required – public government data service.
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_FIRE_PERIMETERS } from '../data/mockData';

const NIFC_BASE =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services' +
  '/WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query';

/**
 * Fetch current fire perimeters from NIFC WFIGS.
 * @param {object} [opts]
 * @param {number} [opts.minAcres=100]  Filter perimeters below this size
 * @returns {Promise<object>}  GeoJSON FeatureCollection
 */
export async function fetchFirePerimeters({ minAcres = 100 } = {}) {
  const params = new URLSearchParams({
    where: `attr_IncidentTypeCategory='WF' AND poly_GISAcres>=${minAcres}`,
    outFields: [
      'poly_IncidentName', 'poly_GISAcres', 'poly_DateCurrent',
      'attr_IncidentName', 'attr_IncidentTypeCategory',
      'attr_PercentContained', 'attr_FireDiscoveryDateTime',
      'attr_ModifiedOnDateTime_dt', 'attr_POOState', 'attr_POOCounty',
      'attr_IncidentManagementOrg', 'attr_TotalIncidentPersonnel',
      'attr_UniqueFireIdentifier', 'attr_FireCause',
    ].join(','),
    f: 'geojson',
    outSR: '4326',
    resultRecordCount: 500,
  });

  const url = `${NIFC_BASE}?${params}`;
  const cacheKey = `nifc:perimeters:${minAcres}`;

  try {
    const data = await fetchWithCache(url, cacheKey, {}, 10 * 60 * 1000);
    if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
    if (data?.features) return normalizePerimeters(data);
    throw new Error('Unexpected response format');
  } catch (err) {
    console.warn('[NIFC] Using fallback perimeters:', err.message);
    return MOCK_FIRE_PERIMETERS;
  }
}

/**
 * Remap attr_/poly_ prefixed properties to the flat schema the map layers expect.
 */
function normalizePerimeters(geojson) {
  return {
    ...geojson,
    features: geojson.features.map(f => ({
      ...f,
      properties: {
        UniqueFireIdentifier:      f.properties.attr_UniqueFireIdentifier || '',
        IncidentName:              f.properties.attr_IncidentName || f.properties.poly_IncidentName || 'Unknown Fire',
        GISAcres:                  f.properties.poly_GISAcres || 0,
        PercentContained:          f.properties.attr_PercentContained ?? 0,
        FireDiscoveryDateTime:     f.properties.attr_FireDiscoveryDateTime,
        ModifiedOnDateTime:        f.properties.attr_ModifiedOnDateTime_dt,
        POOState:                  f.properties.attr_POOState || '',
        POOCounty:                 f.properties.attr_POOCounty || '',
        IncidentManagementOrganization: f.properties.attr_IncidentManagementOrg || '',
        TotalIncidentPersonnel:    f.properties.attr_TotalIncidentPersonnel || 0,
        IncidentTypeCategory:      f.properties.attr_IncidentTypeCategory || 'WF',
        FireCause:                 f.properties.attr_FireCause || '',
      },
    })),
  };
}
