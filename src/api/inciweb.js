/**
 * inciweb.js
 * WFIGS – Wildland Fire Interagency Geospatial Services
 * Fetches current active wildfire incident locations from the WFIGS
 * Current endpoint (public ArcGIS FeatureServer, no key required).
 *
 * Endpoint:
 *   https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/
 *     WFIGS_Incident_Locations_Current/FeatureServer/0/query
 *
 * Falls back to mock incident data when unavailable.
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_INCIDENTS } from '../data/mockData';

const WFIGS_CURRENT =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services' +
  '/WFIGS_Incident_Locations_Current/FeatureServer/0/query';

/**
 * Fetch current active wildfire incidents.
 * Scrubs fires below minAcres (default 0.1).
 * @param {object} [opts]
 * @param {number} [opts.minAcres=0.1]  Filter out fires below this acreage
 * @param {number} [opts.limit=500]
 * @returns {Promise<Array>}  Normalized incident objects
 */
export async function fetchIncidents({ minAcres = 0.1, limit = 500 } = {}) {
  const params = new URLSearchParams({
    where: `GISAcres>=${minAcres}`,
    outFields: '*',
    orderByFields: 'GISAcres DESC',
    resultRecordCount: limit,
    f: 'json',
    outSR: '4326',
    returnGeometry: 'true',
  });

  const url = `${WFIGS_CURRENT}?${params}`;
  const cacheKey = `wfigs:current:${minAcres}`;

  try {
    const data = await fetchWithCache(url, cacheKey, {}, 5 * 60 * 1000);
    if (!data?.features?.length) throw new Error('No incidents returned');
    return normalizeIncidents(data.features);
  } catch (err) {
    console.warn('[WFIGS] Using mock incidents:', err.message);
    // Filter mock data by minAcres too
    return MOCK_INCIDENTS.filter(i => (i.acres || 0) >= minAcres);
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
      state:        (p.POOState || '').replace('US-', '') || '?',
      county:       p.POOCounty || '',
      lat,
      lng,
      acres:        parseFloat(p.GISAcres) || 0,
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
      structures_threatened: p.StructuresThreatened || 0,
      evacuations:  p.Evacuations || '',
      incidentType: p.IncidentTypeCategory || 'WF',
      updates: [],
    };
  });
}

/**
 * Convert array of incidents to GeoJSON FeatureCollection
 * for rendering as interactive point markers on the map.
 */
export function incidentsToGeoJSON(incidents) {
  return {
    type: 'FeatureCollection',
    features: incidents
      .filter(inc => inc.lat && inc.lng && inc.lat !== 0 && inc.lng !== 0)
      .map(inc => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [inc.lng, inc.lat] },
        properties: {
          id:        inc.id,
          name:      inc.name,
          state:     inc.state,
          county:    inc.county,
          acres:     inc.acres,
          contained: inc.contained,
          status:    inc.status,
          personnel: inc.personnel,
          started:   inc.started,
          updated:   inc.updated,
        },
      })),
  };
}
