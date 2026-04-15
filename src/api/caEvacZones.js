/**
 * caEvacZones.js
 *
 * California Evacuation Zones – Cal OES Near-Real-Time
 * Fetches active evacuation orders, warnings, and watches from the
 * California Governor's Office of Emergency Services (Cal OES) public ArcGIS service.
 *
 * Service: OESNRT_EvacWarnings (FeatureServer, public – no API key required)
 * https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/
 *   OESNRT_EvacWarnings/FeatureServer/0/query
 */

import { fetchWithCache } from '../utils/dataCache';

const CAEVAC_BASE =
  'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services' +
  '/OESNRT_EvacWarnings/FeatureServer/0/query';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

/**
 * Fetch active California evacuation zones as a GeoJSON FeatureCollection.
 * Always resolves – returns empty FeatureCollection on any error so the map
 * layer can degrade gracefully without breaking the rest of the app.
 *
 * @returns {Promise<object>}  GeoJSON FeatureCollection
 */
export async function fetchCAEvacZones() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: [
      'OBJECTID', 'ZoneName', 'WarningType', 'County',
      'ExternalURL', 'EffectiveDate', 'ExpirationDate',
    ].join(','),
    f: 'geojson',
    outSR: '4326',
    resultRecordCount: 1000,
  });

  const url = `${CAEVAC_BASE}?${params}`;
  const cacheKey = 'caevac:zones';

  try {
    const data = await fetchWithCache(url, cacheKey, {}, 5 * 60 * 1000);

    // ArcGIS REST error response: {"error":{"code":400,"message":"..."}}
    if (data?.error) {
      const code = data.error.code ? ` (code ${data.error.code})` : '';
      const msg  = data.error.message
        ? `${data.error.message}${code}`
        : `ArcGIS error${code}`;
      throw new Error(msg);
    }

    if (data?.features) return normalizeEvacZones(data);

    throw new Error('Unexpected response format');
  } catch (err) {
    console.warn('[CAEvac] Failed to fetch evacuation zones:', err.message);
    return EMPTY_GEOJSON;
  }
}

/**
 * Normalize Cal OES GeoJSON properties to a consistent flat schema.
 */
function normalizeEvacZones(geojson) {
  return {
    ...geojson,
    features: geojson.features
      .filter(f => f.geometry)
      .map(f => {
        const p = f.properties || {};
        return {
          ...f,
          properties: {
            id:             p.OBJECTID || '',
            zoneName:       p.ZoneName  || 'Evacuation Zone',
            warningType:    p.WarningType || 'Evacuation Warning',
            county:         p.County    || '',
            externalURL:    p.ExternalURL || '',
            effectiveDate:  p.EffectiveDate  || null,
            expirationDate: p.ExpirationDate || null,
          },
        };
      }),
  };
}
