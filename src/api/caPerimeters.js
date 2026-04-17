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
import { getCAMissionLabel } from '../utils/formatUtils';

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
    outFields: 'type,poly_DateCurrent,incident_name,area_acres,description,FireDiscoveryDate,CreationDate,EditDate',
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
 * Fields as of the current NIFC FIRIS public view service schema.
 */
function normalizePerimeters(geojson) {
  return {
    ...geojson,
    features: geojson.features.map(f => {
      const p = f.properties || {};
      const missionLabel = getCAMissionLabel(p.incident_name);
      const fireName = missionLabel || p.incident_name || 'Unknown Fire';
      const discoveryDate = p.FireDiscoveryDate || p.CreationDate || null;
      return {
        ...f,
        properties: {
          UniqueFireIdentifier: fireName
            ? `CA-FIRIS-${fireName}-${discoveryDate || ''}`.replace(/\s+/g, '-')
            : null,
          IncidentName:           fireName,
          DisplayLabel:           missionLabel || null,
          GISAcres:               p.area_acres || 0,
          PercentContained:       0,
          FireDiscoveryDateTime:  discoveryDate,
          ModifiedOnDateTime:     p.poly_DateCurrent || p.EditDate || null,
          POOState:               'CA',
          POOCounty:              '',
          Agency:                 '',
          FireCause:              'Under Investigation',
          FireType:               p.type || '',
          Description:            p.description || '',
          TotalIncidentPersonnel: 0,
          StructuresDestroyed:    0,
          StructuresDamaged:      0,
          IncidentManagementOrganization: '',
          Source:                 'CA_FIRIS',
        },
      };
    }),
  };
}
