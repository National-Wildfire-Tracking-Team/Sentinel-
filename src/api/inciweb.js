/**
 * inciweb.js
 * IRWIN – Integrated Reporting of Wildland-Fire Information
 * Authoritative source for active wildfire incidents (public ArcGIS endpoint).
 *
 * Service: WFIGS_Incident_Locations_Current (replaces deprecated YTD service)
 * https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/
 *   WFIGS_Incident_Locations_Current/FeatureServer/0/query
 *
 * No API key required.
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_INCIDENTS } from '../data/mockData';

const IRWIN_BASE =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services' +
  '/WFIGS_Incident_Locations_Current/FeatureServer/0/query';

/**
 * Fetch active wildfire incidents.
 * @param {object} [opts]
 * @param {number} [opts.minAcres=10]
 * @param {number} [opts.limit=50]
 * @returns {Promise<Array>}  Normalized incident objects
 */
export async function fetchIncidents({ minAcres = 10, limit = 50 } = {}) {
  // IncidentSize is the correct acreage field in the Current service
  const where = [
    `IncidentTypeCategory='WF'`,
    `IncidentSize>=${minAcres}`,
    `ControlDateTime IS NULL`,
  ].join(' AND ');

  const params = new URLSearchParams({
    where,
    outFields: [
      'UniqueFireIdentifier', 'IncidentName', 'POOState', 'POOCounty',
      'IncidentSize', 'PercentContained', 'FireDiscoveryDateTime',
      'ModifiedOnDateTime_dt', 'FireCause', 'TotalIncidentPersonnel',
      'IncidentManagementOrganization',
    ].join(','),
    orderByFields: 'IncidentSize DESC',
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
    const contained = p.PercentContained ?? 0;
    return {
      id:           p.UniqueFireIdentifier || `inc-${i}`,
      name:         p.IncidentName || 'Unknown Fire',
      state:        p.POOState?.replace('US-', '') || '?',
      county:       p.POOCounty || '',
      lat,
      lng,
      acres:        Math.round(p.IncidentSize || 0),
      contained,
      started:      p.FireDiscoveryDateTime
                      ? new Date(p.FireDiscoveryDateTime).toISOString()
                      : null,
      updated:      p.ModifiedOnDateTime_dt
                      ? new Date(p.ModifiedOnDateTime_dt).toISOString()
                      : null,
      cause:        p.FireCause || 'Under Investigation',
      status:       contained >= 100 ? 'controlled' : 'active',
      personnel:    p.TotalIncidentPersonnel || 0,
      structures_destroyed: 0,
      structures_damaged:   0,
      updates: [],
    };
  });
}
