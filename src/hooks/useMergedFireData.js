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
export function getFireMatchKey(name) {
  if (!name) return null;
  const upper = name.toUpperCase().trim();
  if (upper === 'UNKNOWN' || upper === 'UNKNOWN FIRE' || upper === 'UNNAMED' || upper === '') return null;

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

  if (key === 'UNKNOWN' || key === 'UNNAMED') return null;
  return key.length > 0 ? key : null;
}

/** Ray-casting point-in-ring check (2D, works for lng/lat). */
function pointInRing(point, ring) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Returns true if [lng, lat] falls inside a GeoJSON Polygon or MultiPolygon. */
function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInRing(point, geometry.coordinates[0]);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(poly => pointInRing(point, poly[0]));
  }
  return false;
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

  // Pass 1: name-based matching
  const enrichedFeatures = perimeters.features.map(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (key && incidentsByKey.has(key)) {
      usedKeys.add(key);
      const inc = incidentsByKey.get(key);
      return {
        ...f,
        properties: {
          ...f.properties,
          FireCause: f.properties.FireCause || inc.FireCause || 'Undetermined',
          GISAcres: Math.max(f.properties.GISAcres || 0, inc.GISAcres || 0),
          TotalIncidentPersonnel:
            f.properties.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
        },
      };
    }
    return f;
  });

  // Pass 2: proximity fallback — nameless perimeters adopt the name of any
  // unmatched incident dot whose point falls inside the perimeter polygon.
  const finalFeatures = enrichedFeatures.map(f => {
    if (getFireMatchKey(f.properties.IncidentName) !== null) return f;

    const match = incidents.features.find(dot => {
      const dotKey = getFireMatchKey(dot.properties.IncidentName);
      if (!dotKey || usedKeys.has(dotKey)) return false;
      const coords = dot.geometry?.coordinates;
      return Array.isArray(coords) && pointInGeometry([coords[0], coords[1]], f.geometry);
    });

    if (!match) return f;

    const matchKey = getFireMatchKey(match.properties.IncidentName);
    usedKeys.add(matchKey);
    const inc = match.properties;
    return {
      ...f,
      properties: {
        ...f.properties,
        IncidentName: inc.IncidentName,
        FireCause: f.properties.FireCause || inc.FireCause || 'Undetermined',
        GISAcres: Math.max(f.properties.GISAcres || 0, inc.GISAcres || 0),
        TotalIncidentPersonnel:
          f.properties.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
      },
    };
  });

  // Dot markers: incidents that have no matching perimeter
  const dotFeatures = incidents.features.filter(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    return key && !usedKeys.has(key);
  });

  return {
    perimeters: { ...perimeters, features: finalFeatures },
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
