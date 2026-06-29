/**
 * nifc.js
 * NIFC / WFIGS – National Interagency Fire Center
 * Fetches year-to-date fire perimeters from the public ArcGIS REST endpoint.
 *
 * Service: WFIGS_Interagency_Perimeters_YearToDate
 * https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/
 * WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query
 *
 * Also fetches CA perimeters from NIFC FIRIS (more current for California):
 * https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/
 * CA_Perimeters_NIFC_FIRIS_public_view/FeatureServer/0/query
 *
 * No API key required – public government data services.
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_FIRE_PERIMETERS } from '../data/mockData';
import { throttleError } from '../utils/errorThrottle';

const NIFC_BASE =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services' +
  '/WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query';

const FIRIS_BASE =
  'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services' +
  '/CA_Perimeters_NIFC_FIRIS_public_view/FeatureServer/0/query';

/**
 * Retry a function with exponential backoff.
 * Mitigates transient ERR_HTTP2_PROTOCOL_ERROR from ArcGIS on large payloads.
 */
async function withRetry(fn, { attempts = 3, baseDelayMs = 1000, tag = '[NIFC]' } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        // Only log retry attempts, not final failures (those are handled by callers)
        throttleError(tag, `Attempt ${i + 1}/${attempts} failed, retrying in ${delay}ms:`, err, {
          ttlMs: 30 * 1000, // 30 second TTL for retry messages
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Fetch current fire perimeters from NIFC WFIGS.
 * @param {object} [opts]
 * @param {number} [opts.minAcres=100]  Filter perimeters below this size
 * @returns {Promise<object>}  GeoJSON FeatureCollection
 */
export async function fetchFirePerimeters({ minAcres = 0 } = {}) {
  const whereClause = minAcres > 0
    ? `poly_GISAcres>=${minAcres}`
    : '1=1';

  const params = new URLSearchParams({
    where: whereClause,
    outFields: [
      'attr_UniqueFireIdentifier',
      'attr_IncidentName',
      'poly_IncidentName',
      'poly_GISAcres',
      'attr_PercentContained',
      'attr_FireDiscoveryDateTime',
      'attr_ModifiedOnDateTime_dt',
      'attr_POOState',
      'attr_POOCounty',
      'attr_IncidentManagementOrg',
      'attr_TotalIncidentPersonnel',
      'attr_IncidentTypeCategory',
      'attr_FireCause',
    ].join(','),
    outSR: '4326',
    f: 'geojson',
  });

  const url = `${NIFC_BASE}?${params}`;
  const cacheKey = `nifc:perimeters:all:${minAcres}`;

  try {
    const data = await withRetry(() =>
      fetchWithCache(url, cacheKey, {}, 10 * 60 * 1000),
    );
    if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
    if (data?.features) return normalizePerimeters(data);
    throw new Error('Unexpected response format');
  } catch (err) {
    throttleError('[NIFC]', 'Using fallback perimeters:', err, {
      friendlyType: 'generic',
    });
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

/**
 * Fetch CA fire perimeters from NIFC FIRIS (more frequently updated for California).
 * Matches to incident dots via the `incident_name` field.
 * @param {object} [opts]
 * @param {number} [opts.minAcres=0]
 * @returns {Promise<object>}  GeoJSON FeatureCollection (same schema as fetchFirePerimeters)
 */
export async function fetchFIRISPerimeters({ minAcres = 0 } = {}) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: [
      'irwinid',
      'incident_name',
      'gis_acres',
      'perc_contnd',
      'percent_contained',
      'fire_discovery_datetime',
      'date_current',
      'state',
      'county',
      'inci_mgmt_org',
      'total_personnel',
      'inc_type_cat',
      'fire_cause',
    ].join(','),
    outSR: '4326',
    f: 'geojson',
  });

  const url = `${FIRIS_BASE}?${params}`;
  const cacheKey = `nifc:firis:ca:${minAcres}`;

  try {
    const data = await withRetry(() =>
      fetchWithCache(url, cacheKey, {}, 10 * 60 * 1000),
      { tag: '[FIRIS]' },
    );
    if (data?.error) throw new Error(data.error.message || 'ArcGIS FIRIS error');
    if (!data?.features) throw new Error('Unexpected FIRIS response format');

    const normalized = normalizeFIRISPerimeters(data);

    if (minAcres > 0) {
      return {
        ...normalized,
        features: normalized.features.filter(f => (f.properties.GISAcres || 0) >= minAcres),
      };
    }
    return normalized;
  } catch (err) {
    throttleError('[FIRIS]', 'Skipping CA perimeters source:', err, {
      friendlyType: 'unavailable',
    });
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Normalize FIRIS snake_case fields to the flat schema the map layers expect.
 * The `incident_name` field is the primary match key for incident dot suppression.
 */
function normalizeFIRISPerimeters(geojson) {
  return {
    ...geojson,
    features: geojson.features.map(f => {
      const p = f.properties || {};
      return {
        ...f,
        properties: {
          UniqueFireIdentifier:      p.irwinid || p.IRWINID || p.UniqueFireIdentifier || '',
          IncidentName:              p.incident_name || p.IncidentName || p.INCIDENT_NAME || 'Unknown Fire',
          GISAcres:                  p.gis_acres || p.GISAcres || p.GIS_ACRES || 0,
          PercentContained:          p.perc_contnd ?? p.percent_contained ?? p.PercentContained ?? 0,
          FireDiscoveryDateTime:     p.fire_discovery_datetime || p.FireDiscoveryDateTime || p.date_current || null,
          ModifiedOnDateTime:        p.date_current || p.ModifiedOnDateTime || null,
          POOState:                  p.state || p.POOState || 'CA',
          POOCounty:                 p.county || p.POOCounty || '',
          IncidentManagementOrganization: p.inci_mgmt_org || p.IncidentManagementOrganization || '',
          TotalIncidentPersonnel:    p.total_personnel || p.TotalIncidentPersonnel || 0,
          IncidentTypeCategory:      p.inc_type_cat || p.IncidentTypeCategory || 'WF',
          FireCause:                 p.fire_cause || p.FireCause || '',
          _source:                   'FIRIS',
        },
      };
    }),
  };
}
