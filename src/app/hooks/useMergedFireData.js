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
import { fetchFirePerimeters, fetchFIRISPerimeters } from '../api/nifc';
import { fetchIncidentLocationsGeoJSON } from '../api/inciweb';
import { fetchCalFireGeoJsonList, calFireFeatureToIncident } from '../api/calFire';

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
export function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInRing(point, geometry.coordinates[0]);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(poly => pointInRing(point, poly[0]));
  }
  return false;
}

/** Returns [minLng, minLat, maxLng, maxLat] covering a Polygon or MultiPolygon. */
function geometryBBox(geometry) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visitRing = ring => ring.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  if (geometry?.type === 'Polygon') geometry.coordinates.forEach(visitRing);
  else if (geometry?.type === 'MultiPolygon') geometry.coordinates.forEach(poly => poly.forEach(visitRing));
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Returns true if [lng, lat] falls within bufferDeg of a geometry's bounding
 * box. Used as a last-resort proximity check for incident points that sit
 * just outside their fire's perimeter (e.g. an origin point that predates
 * the perimeter's growth, or a command-post location near the fire).
 */
function pointNearGeometry(point, geometry, bufferDeg) {
  const [px, py] = point;
  const [minLng, minLat, maxLng, maxLat] = geometryBBox(geometry);
  return px >= minLng - bufferDeg && px <= maxLng + bufferDeg
      && py >= minLat - bufferDeg && py <= maxLat + bufferDeg;
}

/**
 * Merge two perimeter FeatureCollections. Primary (WFIGS) features take priority;
 * secondary (FIRIS) features are added when their incident_name doesn't already
 * appear in the primary set. FIRIS features with no name (common — many FIRIS
 * perimeters carry a null incident_name) can't be matched against primary by
 * name at all, so they're kept rather than dropped as unmatchable duplicates.
 */
function mergePerimeterSources(primary, secondary) {
  const primaryKeys = new Set();
  primary.features.forEach(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (key) primaryKeys.add(key);
  });

  const addedFeatures = (secondary.features || []).filter(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    return !key || !primaryKeys.has(key);
  });

  return {
    ...primary,
    features: [...primary.features, ...addedFeatures],
  };
}

/**
 * Merge perimeter GeoJSON with incident GeoJSON.
 * Returns enriched perimeters and a dot GeoJSON for unmatched incidents.
 *
 * @param {object} calFireDotsGeoJSON  Optional CAL FIRE incident dots (CA); merged into incidents before matching.
 */
function mergeFireData(perimeters, incidents, calFireDotsGeoJSON = null) {
  // Index incidents by match key
  const incidentsByKey = new Map();
  incidents.features.forEach(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (key) incidentsByKey.set(key, f.properties);
  });

  // CAL FIRE features for California — merge as extra incident dots (deduped below).
  const calFeatures = calFireDotsGeoJSON?.features?.length
    ? calFireDotsGeoJSON.features.map((f, i) => {
        const inc = calFireFeatureToIncident(f, i);
        return {
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            UniqueFireIdentifier: inc.id,
            IncidentName: inc.name,
            GISAcres: inc.acres,
            PercentContained: inc.contained,
            FireDiscoveryDateTime: inc.started,
            ModifiedOnDateTime: inc.updated,
            POOState: 'CA',
            POOCounty: inc.county,
            TotalIncidentPersonnel: 0,
            FireCause: inc.cause,
            _source: 'CAL_FIRE',
            _detailUrl: inc.url || '',
          },
        };
      })
    : [];

  const mergedIncidentFeatures = [...incidents.features, ...calFeatures];

  // Dedupe: IRWIN + CAL FIRE often share the same fire name — keep IRWIN (first wins).
  const seenKeys = new Set();
  const dedupedFeatures = [];
  mergedIncidentFeatures.forEach(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (key) {
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
    }
    dedupedFeatures.push(f);
  });

  const mergedIncidents = { ...incidents, features: dedupedFeatures };

  const usedKeys = new Set();

  // Re-index merged incidents (includes CAL FIRE) for matching
  mergedIncidents.features.forEach(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (key && !incidentsByKey.has(key)) {
      incidentsByKey.set(key, f.properties);
    }
  });

  // Pass 0: ID-based matching — WFIGS Perimeters and Incident Locations both
  // carry the same canonical UniqueFireIdentifier for a given real-world
  // fire. This is more reliable than name/geometry matching: it still links
  // a perimeter to its incident even when the incident's point sits outside
  // the (possibly still-growing) perimeter polygon, or the two services
  // report slightly different name strings.
  const incidentsById = new Map();
  mergedIncidents.features.forEach(f => {
    const id = f.properties.UniqueFireIdentifier;
    if (id) incidentsById.set(id, f.properties);
  });

  const idMatchedFeatures = perimeters.features.map(f => {
    const id = f.properties.UniqueFireIdentifier;
    const inc = id ? incidentsById.get(id) : null;
    if (!inc) return f;
    const incKey = getFireMatchKey(inc.IncidentName);
    if (incKey) usedKeys.add(incKey);
    return {
      ...f,
      properties: {
        ...f.properties,
        IncidentName: getFireMatchKey(f.properties.IncidentName) ? f.properties.IncidentName : inc.IncidentName,
        FireCause: f.properties.FireCause || inc.FireCause || 'Undetermined',
        GISAcres: Math.max(f.properties.GISAcres || 0, inc.GISAcres || 0),
        TotalIncidentPersonnel:
          f.properties.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
      },
    };
  });

  // Pass 1: name-based matching
  const enrichedFeatures = idMatchedFeatures.map(f => {
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

    const match = mergedIncidents.features.find(dot => {
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

  // Pass 3: extended proximity fallback — for perimeters still unnamed after
  // exact containment matching (Pass 2), adopt the name of a nearby
  // unmatched incident dot whose point falls within a small buffer around
  // the perimeter's bounding box, rather than strictly inside it.
  const PROXIMITY_BUFFER_DEG = 0.05; // ~5.5km at the equator — CONUS-appropriate approximation
  const proximityFeatures = finalFeatures.map(f => {
    if (getFireMatchKey(f.properties.IncidentName) !== null) return f;

    const match = mergedIncidents.features.find(dot => {
      const dotKey = getFireMatchKey(dot.properties.IncidentName);
      if (!dotKey || usedKeys.has(dotKey)) return false;
      const coords = dot.geometry?.coordinates;
      return Array.isArray(coords) && pointNearGeometry(coords, f.geometry, PROXIMITY_BUFFER_DEG);
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
  const dotFeatures = mergedIncidents.features.filter(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    return key && !usedKeys.has(key);
  });

  return {
    perimeters: { ...perimeters, features: proximityFeatures },
    dots: { type: 'FeatureCollection', features: dotFeatures },
  };
}

/**
 * @param {number} minAcres  Minimum fire size to include (default 0 – no filtering)
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
export function useMergedFireData(minAcres = 0, enabled = true, calFireIncludeInactive = false) {
  const [perimetersGeoJSON,   setPerimetersGeoJSON]   = useState(null);
  const [incidentDotsGeoJSON, setIncidentDotsGeoJSON] = useState(null);
  const [loading,             setLoading]             = useState(true);
  const [error,               setError]               = useState(null);
  const [perimetersCount,     setPerimetersCount]     = useState(0);
  const [dotsCount,           setDotsCount]           = useState(0);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setError(null);
      const [perimeters, firisPerimeters, incidents, calFireGeoJSON] = await Promise.all([
        fetchFirePerimeters({ minAcres }),
        fetchFIRISPerimeters({ minAcres }),
        fetchIncidentLocationsGeoJSON({ minAcres }),
        fetchCalFireGeoJsonList({ includeInactive: calFireIncludeInactive }).catch(() => ({
          type: 'FeatureCollection',
          features: [],
        })),
      ]);
      if (!mountedRef.current) return;

      // Merge NIFC WFIGS + FIRIS perimeters. WFIGS takes priority for duplicates
      // (matched by normalized incident name); FIRIS adds CA-only fires not in WFIGS.
      const mergedPerimeters = mergePerimeterSources(perimeters, firisPerimeters);

      const calFiltered = {
        ...calFireGeoJSON,
        features: (calFireGeoJSON.features || []).filter(f => {
          const acres = Number(f.properties?.AcresBurned) || 0;
          return acres >= minAcres;
        }),
      };

      const { perimeters: merged, dots } = mergeFireData(mergedPerimeters, incidents, calFiltered);
      setPerimetersGeoJSON(merged);
      setIncidentDotsGeoJSON(dots);
      setPerimetersCount(merged.features.length);
      setDotsCount(dots.features.length);
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [minAcres, enabled, calFireIncludeInactive]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      clearInterval(intervalRef.current);
      setLoading(false);
      return;
    }
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [load, enabled]);

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
