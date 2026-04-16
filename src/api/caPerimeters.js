/**
 * caPerimeters.js
 * California fire perimeters from the NIFC FIRIS public view.
 *
 * Service: CA_Perimeters_NIFC_FIRIS_public_view
 * https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/
 *   CA_Perimeters_NIFC_FIRIS_public_view/FeatureServer/0/query
 *
 * No API key required – public government data service.
 */

import { fetchWithCache } from '../utils/dataCache';

const CA_FIRIS_BASE =
  'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services' +
  '/CA_Perimeters_NIFC_FIRIS_public_view/FeatureServer/0/query';

/**
 * Fetch California fire perimeters from NIFC FIRIS.
 * @returns {Promise<object>}  GeoJSON FeatureCollection
 */
export async function fetchCaPerimeters() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    outSR: '4326',
    f: 'geojson',
  });

  const url = `${CA_FIRIS_BASE}?${params}`;
  const cacheKey = 'ca-firis:perimeters';

  const data = await fetchWithCache(url, cacheKey, {}, 10 * 60 * 1000);
  if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
  if (data?.features) return normalizePerimeters(data);
  throw new Error('Unexpected response format');
}

/**
 * Normalise CA FIRIS field names to the flat schema the map layers expect.
 * FIRIS uses mixed-case field names – fall back across common variants.
 */
function normalizePerimeters(geojson) {
  return {
    ...geojson,
    features: geojson.features.map(f => {
      const p = f.properties || {};
      return {
        ...f,
        properties: {
          IncidentName:        p.FIRE_NAME || p.IncidentName || p.INCIDENT_NAME || 'Unknown Fire',
          GISAcres:            p.GIS_ACRES || p.GISACRES || p.GISAcres || 0,
          PercentContained:    p.PERCENT_CONTAINED ?? p.PercentContained ?? 0,
          FireDiscoveryDateTime: p.ALARM_DATE || p.FireDiscoveryDateTime || null,
          ModifiedOnDateTime:  p.CONT_DATE  || p.ModifiedOnDateTime    || null,
          POOState:            p.STATE      || p.POOState              || 'CA',
          POOCounty:           p.COUNTY     || p.POOCounty             || '',
          Agency:              p.AGENCY     || p.AGENCY_1              || '',
          FireYear:            p.FIRE_YEAR  || p.FIRE_YEAR_1           || '',
          Source:              'CA_FIRIS',
        },
      };
    }),
  };
}
