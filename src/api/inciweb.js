/**
 * inciweb.js
 *
 * IRWIN – Integrated Reporting of Wildland-Fire Information
 * Authoritative source for active wildfire incidents (public ArcGIS endpoint).
 *
 * Service: WFIGS_Incident_Locations_Current (replaces deprecated YTD service)
 * https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/
 * WFIGS_Incident_Locations_Current/FeatureServer/0/query
 *
 * No API key required.
 */

import { fetchWithCache } from '../utils/dataCache';

const IRWIN_ENDPOINTS = [
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services' +
  '/WFIGS_Incident_Locations_Current/FeatureServer/0/query',
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services' +
  '/WFIGS_Incident_Locations/FeatureServer/0/query',
];

async function fetchFromIncidentEndpoints(params, cacheKeyPrefix, ttlMs) {
  const errors = [];

  for (const endpoint of IRWIN_ENDPOINTS) {
    const url = `${endpoint}?${params}`;
    const endpointName = endpoint.split('/ArcGIS/rest/services/')[1]?.split('/FeatureServer')[0] || 'incident-service';
    const cacheKey = `${cacheKeyPrefix}:${endpointName}`;
    try {
      const data = await fetchWithCache(url, cacheKey, {}, ttlMs);
      if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
      if (Array.isArray(data?.features)) return data;
      throw new Error('Unexpected response format');
    } catch (err) {
      errors.push(`${endpointName}: ${err.message}`);
    }
  }

  throw new Error(`Unable to load incident reports (${errors.join(' | ')})`);
}

/**
 * Fetch current active wildfire incidents.
 * Scrubs fires below minAcres (default 0.1).
 * @param {object} [opts]
 * @param {number} [opts.minAcres=.10]
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

  const data = await fetchFromIncidentEndpoints(
    params,
    `irwin:incidents:active:${minAcres}`,
    5 * 60 * 1000,
  );
  return normalizeIncidents(data.features);
}

/**
 * Fetch active wildfire incident locations as a GeoJSON FeatureCollection.
 * Used for rendering incident dot markers on the map (fires without perimeters).
 */
export async function fetchIncidentLocationsGeoJSON({ minAcres = 10 } = {}) {
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
    ].join(','),
    orderByFields: 'IncidentSize DESC',
    f: 'geojson',
    outSR: '4326',
    returnGeometry: 'true',
  });

  const data = await fetchFromIncidentEndpoints(
    params,
    `irwin:incidents:geojson:${minAcres}`,
    5 * 60 * 1000,
  );
  return normalizeIncidentGeoJSON(data);
}

function normalizeIncidentGeoJSON(geojson) {
  return {
    ...geojson,
    features: geojson.features
      .filter(f => f.geometry)
      .map(f => ({
        ...f,
        properties: {
          UniqueFireIdentifier:  f.properties.UniqueFireIdentifier || '',
          IncidentName:          f.properties.IncidentName || 'Unknown Fire',
          GISAcres:              Math.round(f.properties.IncidentSize || 0),
          PercentContained:      f.properties.PercentContained ?? 0,
          FireDiscoveryDateTime: f.properties.FireDiscoveryDateTime,
          ModifiedOnDateTime:    f.properties.ModifiedOnDateTime_dt,
          POOState:              (f.properties.POOState || '').replace('US-', ''),
          POOCounty:             f.properties.POOCounty || '',
          TotalIncidentPersonnel: f.properties.TotalIncidentPersonnel || 0,
          FireCause:             f.properties.FireCause || 'Under Investigation',
        },
      })),
  };
}

function normalizeIncidents(features) {
  return features.map((f, i) => {
    const p = f.attributes ?? f.properties ?? {};
    const [lng, lat] = f.geometry?.x !== undefined
      ? [f.geometry.x, f.geometry.y]
      : (f.geometry?.coordinates ?? [0, 0]);
    const contained = p.PercentContained ?? 0;
    return {
      id:            p.UniqueFireIdentifier || `inc-${i}`,
      name:          p.IncidentName || 'Unknown Fire',
      state:         (p.POOState || '').replace('US-', '') || '?',
      county:        p.POOCounty || '',
      lat,
      lng,
      acres:         Math.round(p.IncidentSize || 0),
      contained,
      started:       p.FireDiscoveryDateTime
                       ? new Date(p.FireDiscoveryDateTime).toISOString()
                       : null,
      updated:       p.ModifiedOnDateTime_dt
                       ? new Date(p.ModifiedOnDateTime_dt).toISOString()
                       : null,
      cause:         p.FireCause || 'Under Investigation',
      status:        contained >= 100 ? 'controlled' : 'active',
      personnel:     p.TotalIncidentPersonnel || 0,
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
