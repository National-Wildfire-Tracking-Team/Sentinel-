/**
 * caEvacZones.js
 *
 * California Evacuation Zones – CalOES Hosted View
 * Fetches active evacuation orders, warnings, and watches from the
 * California Governor's Office of Emergency Services (Cal OES) ArcGIS service.
 *
 * Service: CA_EVACUATIONS_CalOESHosted_view (FeatureServer, public – no API key required)
 * https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services/
 *   CA_EVACUATIONS_CalOESHosted_view/FeatureServer/0/query
 */

import { fetchWithCache } from '../utils/dataCache';

const CAEVAC_BASE =
  'https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services' +
  '/CA_EVACUATIONS_CalOESHosted_view/FeatureServer/0/query';

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
    where:             '1=1',
    outFields:         '*',
    f:                 'geojson',
    outSR:             '4326',
    resultRecordCount: 2000,
  });

  const url      = `${CAEVAC_BASE}?${params}`;
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
 * Return the first non-null, non-empty value from a set of candidate keys.
 * Used to handle field name variations between CalOES service versions.
 */
function pick(props, ...keys) {
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

/**
 * Normalize a raw WarningType / Status value to one of the three canonical
 * strings expected by EvacZonesLayer color-match expression:
 *   "Evacuation Order" | "Evacuation Warning" | "Evacuation Watch"
 */
function normalizeWarningType(raw) {
  if (!raw) return 'Evacuation Warning';
  const s = String(raw).trim().toLowerCase();

  if (s.includes('order') || s.includes('mandatory') || s === 'eo') {
    return 'Evacuation Order';
  }
  if (s.includes('watch') || s === 'ew' && s.length === 2) {
    return 'Evacuation Watch';
  }
  // "warning", "voluntary", "advisory", or anything else → Warning
  return 'Evacuation Warning';
}

/**
 * Normalize CalOES GeoJSON properties to a consistent flat schema.
 * Handles field name variations between service versions.
 */
function normalizeEvacZones(geojson) {
  return {
    ...geojson,
    features: geojson.features
      .filter(f => f.geometry)
      .map(f => {
        const p = f.properties || {};

        const rawType = pick(
          p,
          'WarningType', 'warning_type', 'Status', 'status',
          'EvacStatus', 'evac_status', 'Type', 'type', 'ExZoneStatus',
        );

        return {
          ...f,
          properties: {
            id:             pick(p, 'OBJECTID', 'ObjectID', 'GlobalID', 'globalid') ?? '',
            zoneName:       pick(p, 'ZoneName', 'zone_name', 'Name', 'name', 'ZoneID', 'ExZoneName') || 'Evacuation Zone',
            warningType:    normalizeWarningType(rawType),
            county:         pick(p, 'County', 'county', 'COUNTY', 'CountyName', 'county_name') || '',
            externalURL:    pick(p, 'ExternalURL', 'external_url', 'URL', 'url', 'MoreInfo') || '',
            effectiveDate:  pick(p, 'EffectiveDate', 'effective_date', 'DateEffective', 'DateTimeEffective', 'created_date') || null,
            expirationDate: pick(p, 'ExpirationDate', 'expiration_date', 'DateExpires', 'DateTimeExpires', 'expire_date') || null,
          },
        };
      }),
  };
}
