/**
 * caEvacuations.js
 * California Active Evacuation Zones – CalOES / ArcGIS Online
 *
 * Service: CA_EVACUATIONS_PROD FeatureServer
 * https://services3.arcgis.com/uknczv4rpevve42E/arcgis/rest/services/CA_EVACUATIONS_PROD/FeatureServer
 *
 * No API key required – public government data.
 * Zone_Status values: "Evacuation Order", "Evacuation Warning", "Evacuation Advisory"
 */

import { fetchWithCache } from '../utils/dataCache';

const EVAC_BASE =
  'https://services3.arcgis.com/uknczv4rpevve42E/arcgis/rest/services' +
  '/CA_EVACUATIONS_PROD/FeatureServer/0/query';

/**
 * Fetch active California evacuation zones.
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
export async function fetchCaEvacuations() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: [
      'Zone_Status',
      'Zone_Name',
      'IncidentName',
      'Agency',
      'Date_Time_Issued',
      'Last_Update',
      'Comments',
      'Jurisdiction',
      'Instructions',
    ].join(','),
    f: 'geojson',
    outSR: '4326',
    resultRecordCount: 2000,
  });

  const url = `${EVAC_BASE}?${params}`;
  const cacheKey = 'ca:evacuations';

  try {
    const data = await fetchWithCache(url, cacheKey, {}, 5 * 60 * 1000);
    if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
    if (data?.features) return normalizeEvacuations(data);
    throw new Error('Unexpected response format');
  } catch (err) {
    console.warn('[CAEvac] Failed to fetch evacuation zones:', err.message);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Normalize field names defensively – the CalOES service has evolved over time
 * and field names may differ slightly between layers.
 */
function normalizeEvacuations(geojson) {
  return {
    ...geojson,
    features: geojson.features.map(f => {
      const p = f.properties || {};
      return {
        ...f,
        properties: {
          Zone_Status:       p.Zone_Status       || p.Status          || p.zone_status    || 'Evacuation Order',
          Zone_Name:         p.Zone_Name         || p.Name            || p.zone_name      || 'Evacuation Zone',
          IncidentName:      p.IncidentName      || p.Incident_Name   || p.incident_name  || '',
          Agency:            p.Agency            || p.agency          || '',
          Date_Time_Issued:  p.Date_Time_Issued  || p.Date_Issued     || p.start_date     || null,
          Last_Update:       p.Last_Update       || p.Last_Updated    || p.last_update    || null,
          Comments:          p.Comments          || p.Description     || p.comments       || '',
          Jurisdiction:      p.Jurisdiction      || p.County          || p.jurisdiction   || '',
          Instructions:      p.Instructions      || p.instructions    || '',
        },
      };
    }),
  };
}
