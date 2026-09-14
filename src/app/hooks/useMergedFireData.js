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

function bboxArea([minLng, minLat, maxLng, maxLat]) {
  return Math.max(0, maxLng - minLng) * Math.max(0, maxLat - minLat);
}

/** Intersection-over-union of two [minLng, minLat, maxLng, maxLat] boxes. */
function bboxIoU(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const interArea = ix * iy;
  if (interArea <= 0) return 0;
  const unionArea = bboxArea(a) + bboxArea(b) - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

// A fire that grew a lot between two mapping flights can drop well below a
// "near-total overlap" threshold, so this is kept fairly low.
const DUPLICATE_MAPPING_IOU_THRESHOLD = 0.4;

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i) {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(i, j) {
    const ri = this.find(i);
    const rj = this.find(j);
    if (ri !== rj) this.parent[ri] = rj;
  }
}

/**
 * A fire is sometimes mapped more than once (a new perimeter record under a
 * new UniqueFireIdentifier, older capture left in place). Records are
 * grouped by shared ID or heavily overlapping geometry — not name, since the
 * same fire name commonly recurs across unrelated fires nationwide. Every
 * record but the most recently modified one in a group is tagged historical.
 */
export function tagHistoricalMappings(perimeters) {
  const features = perimeters?.features;
  if (!features?.length || features.length < 2) return perimeters;

  const n = features.length;
  const bboxes = features.map(f => geometryBBox(f.geometry));
  const uf = new UnionFind(n);

  for (let i = 0; i < n; i++) {
    const idI = features[i].properties?.UniqueFireIdentifier;
    for (let j = i + 1; j < n; j++) {
      const idJ = features[j].properties?.UniqueFireIdentifier;
      const sameId = Boolean(idI) && idI === idJ;
      if (sameId || bboxIoU(bboxes[i], bboxes[j]) >= DUPLICATE_MAPPING_IOU_THRESHOLD) {
        uf.union(i, j);
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }

  const mappingTime = f => {
    const t = new Date(f.properties.ModifiedOnDateTime || f.properties.FireDiscoveryDateTime || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  // A capture's own name field is sometimes blank (e.g. a FIRIS mission's
  // later heat-perimeter capture drops incident_name); inherit the most
  // recently known real name from elsewhere in the cluster so the active
  // record doesn't fall back to a placeholder like "Unknown Fire" when a
  // sibling capture already carries the fire's real name.
  const historicalIdx = new Set();
  const inheritedName = new Map();
  groups.forEach(idxs => {
    if (idxs.length < 2) return;
    const maxTime = Math.max(...idxs.map(idx => mappingTime(features[idx])));
    idxs.forEach(idx => {
      if (mappingTime(features[idx]) < maxTime) historicalIdx.add(idx);
    });

    let bestNamedIdx = null;
    idxs.forEach(idx => {
      if (!getFireMatchKey(features[idx].properties.IncidentName)) return;
      if (bestNamedIdx === null || mappingTime(features[idx]) > mappingTime(features[bestNamedIdx])) {
        bestNamedIdx = idx;
      }
    });
    if (bestNamedIdx !== null) {
      idxs.forEach(idx => {
        if (!getFireMatchKey(features[idx].properties.IncidentName)) {
          inheritedName.set(idx, features[bestNamedIdx].properties.IncidentName);
        }
      });
    }
  });

  if (historicalIdx.size === 0 && inheritedName.size === 0) return perimeters;

  return {
    ...perimeters,
    features: features.map((f, idx) => {
      if (!historicalIdx.has(idx) && !inheritedName.has(idx)) return f;
      return {
        ...f,
        properties: {
          ...f.properties,
          ...(inheritedName.has(idx) ? { IncidentName: inheritedName.get(idx) } : null),
          ...(historicalIdx.has(idx) ? { isHistoricalMapping: true } : null),
        },
      };
    }),
  };
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
  // CAL FIRE features for California — the originating state agency, and
  // (per direct comparison against IRWIN on live fires) typically more
  // current, so it's treated as authoritative for CA fires below.
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

  const incidentTime = props => {
    const t = new Date(props.ModifiedOnDateTime || props.FireDiscoveryDateTime || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  // Index incidents by match key: when IRWIN and CAL FIRE both report the
  // same CA fire, CAL FIRE's record wins; within the same source, keep the
  // more recently modified one rather than whichever happens to come last
  // in the API's result order.
  const featuresByKey = new Map();
  const noKeyFeatures = [];
  const considerIncident = f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (!key) { noKeyFeatures.push(f); return; }
    const existing = featuresByKey.get(key);
    if (!existing) { featuresByKey.set(key, f); return; }
    const existingIsCalFire = existing.properties._source === 'CAL_FIRE';
    const candidateIsCalFire = f.properties._source === 'CAL_FIRE';
    if (candidateIsCalFire !== existingIsCalFire) {
      if (candidateIsCalFire) featuresByKey.set(key, f);
      return;
    }
    if (incidentTime(f.properties) > incidentTime(existing.properties)) {
      featuresByKey.set(key, f);
    }
  };
  incidents.features.forEach(considerIncident);
  calFeatures.forEach(considerIncident);

  const mergedIncidents = {
    ...incidents,
    features: [...featuresByKey.values(), ...noKeyFeatures],
  };

  const incidentsByKey = new Map();
  featuresByKey.forEach((f, key) => incidentsByKey.set(key, f.properties));

  const usedKeys = new Set();

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
        PercentContained: Math.max(f.properties.PercentContained || 0, inc.PercentContained || 0),
        TotalIncidentPersonnel:
          f.properties.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
      },
    };
  });

  // Pass 1: name-based matching. Also adopts the incident's canonical
  // UniqueFireIdentifier — a name-only match means Pass 0's ID lookup didn't
  // find this incident, so the perimeter's own id is source-specific (e.g. a
  // FIRIS capture's GlobalID) rather than the real fire's id, and features
  // downstream (incident update history, community reports) are keyed off
  // the canonical id.
  const enrichedFeatures = idMatchedFeatures.map(f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (key && incidentsByKey.has(key)) {
      usedKeys.add(key);
      const inc = incidentsByKey.get(key);
      return {
        ...f,
        properties: {
          ...f.properties,
          UniqueFireIdentifier: inc.UniqueFireIdentifier || f.properties.UniqueFireIdentifier,
          FireCause: f.properties.FireCause || inc.FireCause || 'Undetermined',
          GISAcres: Math.max(f.properties.GISAcres || 0, inc.GISAcres || 0),
          PercentContained: Math.max(f.properties.PercentContained || 0, inc.PercentContained || 0),
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
      const mergedPerimeters = tagHistoricalMappings(mergePerimeterSources(perimeters, firisPerimeters));

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
