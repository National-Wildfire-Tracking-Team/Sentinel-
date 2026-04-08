/**
 * useMergedFireData.js
 * Fetches NIFC perimeters + IRWIN incident locations, then merges them:
 *   - Perimeters are enriched with incident data (FireCause, personnel)
 *   - Incidents that already have a matching perimeter are suppressed as dots
 *   - Remaining unmatched incidents become orange dot markers on the map
 *
 * Fire name matching follows the same normalization logic as the working map
 * reference implementation to handle naming inconsistencies across services.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFirePerimeters } from '../api/nifc';
import { fetchIncidentLocationsGeoJSON } from '../api/inciweb';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

/**
 * Normalize a fire name into a match key.
 * Strips common suffixes, handles slash-separated names (takes last part),
 * and collapses whitespace so "RIDGE FIRE" and "RIDGEFIRE" both key to "RIDGE".
 */
function getFireMatchKey(name) {
  if (!name) return null;
  const upper = name.toUpperCase().trim();
  if (upper === 'UNKNOWN' || upper === 'UNNAMED' || upper === '') return null;

  let key = upper;
  if (key.includes('/')) {
    key = key.split('/').pop().trim();
  }

  key = key
    .replace(/FIRE PERIMETER/g, '')
    .replace(/PERIMETER/g, '')
    .replace(/INCIDENT/g, '')
    .replace(/\bFIRE\b/g, '')
    .replace(/\s+/g, '');

  return key.length > 0 ? key : null;
}

/**
 * Merge perimeter GeoJSON with incident GeoJSON.
 * Returns enriched perimeters and a dot GeoJSON for unmatched incidents.
 */
function mergeFireData(perimeters, incidents) {
  // Index incidents by match key
  const incidentsByKey = new Map();
  incidents.features.forEach(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (key) incidentsByKey.set(key, f.properties);
  });

  const usedKeys = new Set();

  const enrichedFeatures = perimeters.features.map(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (key && incidentsByKey.has(key)) {
      usedKeys.add(key);
      const inc = incidentsByKey.get(key);
      return {
        ...f,
        properties: {
          ...f.properties,
          // Fill in missing cause from incident record
          FireCause: f.properties.FireCause || inc.FireCause || 'Undetermined',
          // Take the larger acreage between perimeter GIS calc and incident report
          GISAcres: Math.max(f.properties.GISAcres || 0, inc.GISAcres || 0),
          // Fill in personnel if perimeter record lacks it
          TotalIncidentPersonnel:
            f.properties.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
        },
      };
    }
    return f;
  });

  // Dot markers: incidents that have no matching perimeter
  const dotFeatures = incidents.features.filter(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    return key && !usedKeys.has(key);
  });

  return {
    perimeters: { ...perimeters, features: enrichedFeatures },
    dots: { type: 'FeatureCollection', features: dotFeatures },
  };
}

/**
 * @param {number} minAcres  Minimum fire size to include (default 100 ac)
 * @returns {{
 *   perimetersGeoJSON: object|null,
 *   incidentDotsGeoJSON: object|null,
 *   loading: boolean,
 *   error: string|null,
 *   perimetersCount: number,
 *   dotsCount: number,
 *   refresh: function,
 * }}
 */
export function useMergedFireData(minAcres = 100) {
  const [perimetersGeoJSON,   setPerimetersGeoJSON]   = useState(null);
  const [incidentDotsGeoJSON, setIncidentDotsGeoJSON] = useState(null);
  const [loading,             setLoading]             = useState(true);
  const [error,               setError]               = useState(null);
  const [perimetersCount,     setPerimetersCount]     = useState(0);
  const [dotsCount,           setDotsCount]           = useState(0);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [perimeters, incidents] = await Promise.all([
        fetchFirePerimeters({ minAcres }),
        fetchIncidentLocationsGeoJSON({ minAcres }),
      ]);

      const { perimeters: merged, dots } = mergeFireData(perimeters, incidents);
      setPerimetersGeoJSON(merged);
      setIncidentDotsGeoJSON(dots);
      setPerimetersCount(merged.features.length);
      setDotsCount(dots.features.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [minAcres]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  return {
    perimetersGeoJSON,
    incidentDotsGeoJSON,
    loading,
    error,
    perimetersCount,
    dotsCount,
    refresh: load,
  };
}
