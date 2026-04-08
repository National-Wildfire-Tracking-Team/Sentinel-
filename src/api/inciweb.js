/**
 * inciweb.js
 * InciWeb / IRWIN – Incident information feed.
 * InciWeb doesn't have a formal public JSON API, so we use the
 * IRWIN (Integrated Reporting of Wildland-Fire Information) endpoint
 * which is the authoritative source for active incidents.
 *
 * IRWIN ArcGIS endpoint (public):
 * https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/
 *   WFIGS_Incident_Locations_YTD/FeatureServer/0/query
 *
 * Falls back to mock incident data when unavailable.
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_INCIDENTS } from '../data/mockData';

const IRWIN_BASE =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services' +
  '/WFIGS_Incident_Locations_YTD/FeatureServer/0/query';

/**
 * Fetch active wildfire incidents.
 * @param {object} [opts]
 * @param {number} [opts.minAcres=100]
 * @param {number} [opts.limit=50]
 * @returns {Promise<Array>}  Normalized incident objects
 */
export async function fetchIncidents({ minAcres = 10, limit = 50 } = {}) {
  // Filter for active wildfires: not yet controlled (ControlDateTime is null)
  const where = [
    `IncidentTypeCategory='WF'`,
    `GISAcres>=${minAcres}`,
    `ControlDateTime IS NULL`,
  ].join(' AND ');

  const params = new URLSearchParams({
    where,
    outFields: [
      'UniqueFireIdentifier', 'IncidentName', 'POOState', 'POOCounty',
      'GISAcres', 'PercentContained', 'FireDiscoveryDateTime',
      'ModifiedOnDateTime', 'FireCause', 'TotalIncidentPersonnel',
      'StructuresDestroyed', 'StructuresDamaged', 'IncidentManagementOrganization',
    ].join(','),
    orderByFields: 'GISAcres DESC',
    resultRecordCount: limit,
    f: 'json',
    outSR: '4326',
    returnGeometry: 'true',
  });

  const url = `${IRWIN_BASE}?${params}`;
  const cacheKey = `irwin:incidents:active:${minAcres}`;

  try {
    const data = await fetchWithCache(url, cacheKey, {}, 5 * 60 * 1000);
    if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
    // Return live results even if empty – fallback only on actual failures
    if (data?.features) return normalizeIncidents(data.features);
    throw new Error('Unexpected response format');
  } catch (err) {
    console.warn('[InciWeb/IRWIN] Using fallback incidents:', err.message);
    return MOCK_INCIDENTS;
  }
}

function normalizeIncidents(features) {
  return features.map((f, i) => {
    const p = f.attributes ?? f.properties ?? {};
    const [lng, lat] = f.geometry?.x !== undefined
      ? [f.geometry.x, f.geometry.y]
      : (f.geometry?.coordinates ?? [0, 0]);
    return {
      id:           p.UniqueFireIdentifier || `inc-${i}`,
      name:         p.IncidentName || 'Unknown Fire',
      state:        p.POOState?.replace('US-', '') || '?',
      county:       p.POOCounty || '',
      lat,
      lng,
      acres:        Math.round(p.GISAcres || 0),
      contained:    p.PercentContained ?? 0,
      started:      p.FireDiscoveryDateTime
                      ? new Date(p.FireDiscoveryDateTime).toISOString()
                      : null,
      updated:      p.ModifiedOnDateTime
                      ? new Date(p.ModifiedOnDateTime).toISOString()
                      : null,
      cause:        p.FireCause || 'Under Investigation',
      status:       (p.PercentContained ?? 0) >= 100 ? 'controlled' : 'active',
      personnel:    p.TotalIncidentPersonnel || 0,
      structures_destroyed: p.StructuresDestroyed || 0,
      structures_damaged:   p.StructuresDamaged   || 0,
      updates: [],
    };
  });
}
