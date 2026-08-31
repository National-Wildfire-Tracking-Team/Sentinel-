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
import { throttleError } from '../../shared/utils/errorThrottle';

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
 * Fetch every page of an ArcGIS query, following `exceededTransferLimit`.
 * ArcGIS FeatureServers cap results at their `maxRecordCount` (2000 for this
 * service) — a query matching more records than that silently drops the
 * remainder with no error. The nationwide WFIGS perimeters query regularly
 * matches 2700+ fires, which was silently losing ~800 real fires (including
 * large, notable ones) with no indication anything was missing.
 * Ordered by OBJECTID so `resultOffset` paging is stable across requests.
 */
async function fetchAllPages(baseUrl, cacheKeyBase, ttlMs, tag) {
  const pageSize = 2000;
  const maxPages = 10; // hard cap against a runaway loop; ~20k records
  let offset = 0;
  let allFeatures = [];
  let geojsonShell = null;

  for (let page = 0; page < maxPages; page++) {
    const pagedUrl = `${baseUrl}&orderByFields=OBJECTID&resultOffset=${offset}&resultRecordCount=${pageSize}`;
    const data = await withRetry(
      () => fetchWithCache(pagedUrl, `${cacheKeyBase}:offset${offset}`, {}, ttlMs),
      { tag }
    );
    if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
    if (!data?.features) throw new Error('Unexpected response format');

    geojsonShell = geojsonShell || data;
    allFeatures = allFeatures.concat(data.features);

    if (!data.properties?.exceededTransferLimit && data.features.length < pageSize) break;
    offset += pageSize;
  }

  return { ...geojsonShell, features: allFeatures };
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
    const data = await fetchAllPages(url, cacheKey, 10 * 60 * 1000, '[NIFC]');
    return normalizePerimeters(data);
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
    // This service has no PercentContained field, so contained/old perimeters
    // can't be greyed out on the map — filter to Active only, since the other
    // ~90% of records are stale historical burn scars, not real-time data.
    where: "displayStatus='Active'",
    outFields: [
      'GlobalID',
      'type',
      'source',
      'mission',
      'incident_name',
      'incident_number',
      'area_acres',
      'description',
      'FireDiscoveryDate',
      'poly_DateCurrent',
      'displayStatus',
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
 * Normalize FIRIS/WFIGS combo layer fields to the flat schema the map layers expect.
 * The `incident_name` field is the primary match key for incident dot suppression.
 *
 * Current live schema (service was renamed to "FIRIS WFIGS ComboLayer" and no
 * longer exposes the old irwinid/gis_acres/perc_contnd/state/county/etc. fields):
 *   type, source, mission, incident_name, incident_number, area_acres,
 *   description, FireDiscoveryDate, poly_DateCurrent, displayStatus, GlobalID
 */
function normalizeFIRISPerimeters(geojson) {
  return {
    ...geojson,
    features: geojson.features.map(f => {
      const p = f.properties || {};
      return {
        ...f,
        properties: {
          UniqueFireIdentifier:      p.GlobalID || p.irwinid || p.IRWINID || p.UniqueFireIdentifier || '',
          IncidentName:              p.incident_name || p.IncidentName || p.INCIDENT_NAME || 'Unknown Fire',
          GISAcres:                  p.area_acres ?? p.gis_acres ?? p.GISAcres ?? p.GIS_ACRES ?? 0,
          PercentContained:          p.perc_contnd ?? p.percent_contained ?? p.PercentContained ?? 0,
          FireDiscoveryDateTime:     p.FireDiscoveryDate || p.fire_discovery_datetime || p.poly_DateCurrent || null,
          ModifiedOnDateTime:        p.poly_DateCurrent || p.date_current || p.ModifiedOnDateTime || null,
          POOState:                  p.state || p.POOState || 'CA',
          POOCounty:                 p.county || p.POOCounty || '',
          IncidentManagementOrganization: p.mission || p.inci_mgmt_org || p.IncidentManagementOrganization || '',
          TotalIncidentPersonnel:    p.total_personnel || p.TotalIncidentPersonnel || 0,
          IncidentTypeCategory:      p.type || p.inc_type_cat || p.IncidentTypeCategory || 'WF',
          FireCause:                 p.fire_cause || p.FireCause || '',
          IncidentNumber:            p.incident_number || '',
          Description:               p.description || '',
          DisplayStatus:             p.displayStatus || '',
          _source:                   p.source || 'FIRIS',
        },
      };
    }),
  };
}
