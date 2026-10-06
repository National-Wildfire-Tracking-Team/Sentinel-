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
import { joinAliasIds } from '../utils/incidentAliases';

const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_INTERVAL || '300000', 10);

// When set, points at cloud/fire-perimeters-merge — a Cloud Run service that
// fetches all four sources and runs this same merge pipeline server-side on
// a shared cache, so every client makes one small request instead of
// independently fetching+merging every REFRESH_MS. See that service's
// README for the (opt-in, verify-first) rollout plan for this safety-
// relevant layer. Falls back to the original per-client fetch+merge below
// when unset.
const FIRE_MERGE_SERVICE_URL = import.meta.env.VITE_FIRE_MERGE_SERVICE_URL || null;

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
export function pointNearGeometry(point, geometry, bufferDeg) {
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
  // Every member of a multi-record group is also stamped `_mappingGroup`, so
  // mergeFireData can share a name it only learns later (from a CAL FIRE /
  // IRWIN point) across the whole group.
  const historicalIdx = new Set();
  const inheritedName = new Map();
  const groupOf = new Map();
  groups.forEach((idxs, root) => {
    if (idxs.length < 2) return;
    idxs.forEach(idx => groupOf.set(idx, String(root)));
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

  if (groupOf.size === 0) return perimeters;

  return {
    ...perimeters,
    features: features.map((f, idx) => {
      if (!groupOf.has(idx)) return f;
      return {
        ...f,
        properties: {
          ...f.properties,
          _mappingGroup: groupOf.get(idx),
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
 * Stats a perimeter takes from its matched incident. CAL FIRE and IRWIN
 * update size, containment and their timestamp far more often than a
 * perimeter is re-flown, so the larger figure and the later time win.
 */
function incidentStats(props, inc) {
  const time = v => {
    const t = new Date(v || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  return {
    FireCause: props.FireCause || inc.FireCause || 'Undetermined',
    GISAcres: Math.max(props.GISAcres || 0, inc.GISAcres || 0),
    PercentContained: Math.max(props.PercentContained || 0, inc.PercentContained || 0),
    TotalIncidentPersonnel: props.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
    ModifiedOnDateTime: time(inc.ModifiedOnDateTime) > time(props.ModifiedOnDateTime)
      ? inc.ModifiedOnDateTime
      : props.ModifiedOnDateTime,
  };
}

/**
 * Proximity matching for perimeters that are still nameless (common for
 * FIRIS / USFS heat-perimeter captures): adopt the incident whose point
 * `isNear` the perimeter.
 *
 * A fire flown several times leaves several nameless captures around the
 * same point (see tagHistoricalMappings). Captures are visited current-first,
 * so the one drawn as the live fire gets the incident's name, id and stats
 * rather than an older greyed-out capture. Captures sharing a
 * `_mappingGroup` are tested against every geometry in the group, and may
 * adopt an incident another capture of the same fire already claimed.
 */
function adoptNearbyIncidents(features, incidentFeatures, usedKeys, isNear) {
  const groupGeometries = new Map();
  features.forEach(f => {
    const group = f.properties._mappingGroup;
    if (!group) return;
    if (!groupGeometries.has(group)) groupGeometries.set(group, []);
    groupGeometries.get(group).push(f.geometry);
  });

  const time = f => {
    const t = new Date(f.properties.ModifiedOnDateTime || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const order = features.map((_, idx) => idx).sort((a, b) => {
    const histDelta = (features[a].properties.isHistoricalMapping ? 1 : 0)
      - (features[b].properties.isHistoricalMapping ? 1 : 0);
    return histDelta !== 0 ? histDelta : time(features[b]) - time(features[a]);
  });

  const out = features.slice();
  for (const idx of order) {
    const f = out[idx];
    if (getFireMatchKey(f.properties.IncidentName) !== null) continue;
    const group = f.properties._mappingGroup || null;
    const geometries = group ? groupGeometries.get(group) : [f.geometry];

    const match = incidentFeatures.find(dot => {
      const dotKey = getFireMatchKey(dot.properties.IncidentName);
      if (!dotKey) return false;
      if (usedKeys.has(dotKey) && (!group || usedKeys.get(dotKey) !== group)) return false;
      const coords = dot.geometry?.coordinates;
      return Array.isArray(coords) && geometries.some(g => isNear([coords[0], coords[1]], g));
    });
    if (!match) continue;

    const matchKey = getFireMatchKey(match.properties.IncidentName);
    if (!usedKeys.has(matchKey)) usedKeys.set(matchKey, group);
    const inc = match.properties;
    out[idx] = {
      ...f,
      properties: {
        ...f.properties,
        IncidentName: inc.IncidentName,
        UniqueFireIdentifier: inc.UniqueFireIdentifier || f.properties.UniqueFireIdentifier,
        // The perimeter's own id (often a capture-specific one) stays reachable.
        _aliasIds: joinAliasIds(
          inc.UniqueFireIdentifier || f.properties.UniqueFireIdentifier,
          f.properties.UniqueFireIdentifier, f.properties._aliasIds, inc._aliasIds,
        ),
        ...incidentStats(f.properties, inc),
      },
    };
  }
  return out;
}

/**
 * Merge perimeter GeoJSON with incident GeoJSON.
 * Returns enriched perimeters and a dot GeoJSON for unmatched incidents.
 *
 * @param {object} calFireDotsGeoJSON  Optional CAL FIRE incident dots (CA); merged into incidents before matching.
 */
export function mergeFireData(perimeters, incidents, calFireDotsGeoJSON = null) {
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
  // The losing record's id (and anything it had absorbed) is kept on the
  // winner as `_aliasIds`, so data stored under either id stays reachable —
  // see src/app/utils/incidentAliases.js.
  const featuresByKey = new Map();
  const aliasesByKey = new Map();
  const noKeyFeatures = [];
  const considerIncident = f => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (!key) { noKeyFeatures.push(f); return; }
    const existing = featuresByKey.get(key);
    if (!existing) { featuresByKey.set(key, f); return; }
    const existingIsCalFire = existing.properties._source === 'CAL_FIRE';
    const candidateIsCalFire = f.properties._source === 'CAL_FIRE';
    const candidateWins = candidateIsCalFire !== existingIsCalFire
      ? candidateIsCalFire
      : incidentTime(f.properties) > incidentTime(existing.properties);
    const loser = candidateWins ? existing : f;
    aliasesByKey.set(key, joinAliasIds(null, aliasesByKey.get(key), loser.properties.UniqueFireIdentifier, loser.properties._aliasIds));
    if (candidateWins) featuresByKey.set(key, f);
  };
  incidents.features.forEach(considerIncident);
  calFeatures.forEach(considerIncident);

  for (const [key, f] of featuresByKey) {
    const aliases = joinAliasIds(f.properties.UniqueFireIdentifier, aliasesByKey.get(key), f.properties._aliasIds);
    if (aliases) featuresByKey.set(key, { ...f, properties: { ...f.properties, _aliasIds: aliases } });
  }

  const mergedIncidents = {
    ...incidents,
    features: [...featuresByKey.values(), ...noKeyFeatures],
  };

  const incidentsByKey = new Map();
  featuresByKey.forEach((f, key) => incidentsByKey.set(key, f.properties));

  // Match key → the `_mappingGroup` of the perimeter that claimed it (null
  // when ungrouped). Other captures of that same fire may still adopt it.
  const usedKeys = new Map();

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
    if (incKey) usedKeys.set(incKey, f.properties._mappingGroup || null);
    return {
      ...f,
      properties: {
        ...f.properties,
        _aliasIds: joinAliasIds(id, f.properties._aliasIds, inc._aliasIds),
        IncidentName: getFireMatchKey(f.properties.IncidentName) ? f.properties.IncidentName : inc.IncidentName,
        ...incidentStats(f.properties, inc),
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
      usedKeys.set(key, f.properties._mappingGroup || null);
      const inc = incidentsByKey.get(key);
      return {
        ...f,
        properties: {
          ...f.properties,
          UniqueFireIdentifier: inc.UniqueFireIdentifier || f.properties.UniqueFireIdentifier,
          // The perimeter's own id (often a capture-specific one) stays reachable.
          _aliasIds: joinAliasIds(
            inc.UniqueFireIdentifier || f.properties.UniqueFireIdentifier,
            f.properties.UniqueFireIdentifier, f.properties._aliasIds, inc._aliasIds,
          ),
          ...incidentStats(f.properties, inc),
        },
      };
    }
    return f;
  });

  // Pass 2: proximity fallback — nameless perimeters adopt the name of any
  // unmatched incident dot whose point falls inside the perimeter polygon.
  // Pass 3: extended proximity fallback — for perimeters still unnamed after
  // exact containment matching, adopt the name of a nearby unmatched incident
  // dot whose point falls within a small buffer around the perimeter's
  // bounding box, rather than strictly inside it.
  const PROXIMITY_BUFFER_DEG = 0.05; // ~5.5km at the equator — CONUS-appropriate approximation
  const finalFeatures = adoptNearbyIncidents(
    enrichedFeatures, mergedIncidents.features, usedKeys,
    (point, geometry) => pointInGeometry(point, geometry),
  );
  const proximityFeatures = adoptNearbyIncidents(
    finalFeatures, mergedIncidents.features, usedKeys,
    (point, geometry) => pointNearGeometry(point, geometry, PROXIMITY_BUFFER_DEG),
  );

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
 * Cheap per-feature fingerprint used to detect whether a freshly fetched +
 * merged FeatureCollection actually differs from the previous one. ArcGIS
 * bumps ModifiedOnDateTime whenever a record (including its geometry) is
 * re-mapped, so comparing these fields is a good proxy for "did anything
 * change" without diffing full polygon coordinate arrays.
 */
function computeFeatureSignature(fc) {
  return fc.features
    .map(f => {
      const p = f.properties || {};
      return `${p.UniqueFireIdentifier || ''}|${p._aliasIds || ''}|${p.ModifiedOnDateTime || ''}|${p.GISAcres || 0}|${p.PercentContained || 0}|${p.IncidentName || ''}|${p.isHistoricalMapping ? 1 : 0}`;
    })
    .join(';');
}

async function fetchFromMergeService(minAcres, calFireIncludeInactive) {
  const params = new URLSearchParams({
    minAcres: String(minAcres),
    includeInactive: String(calFireIncludeInactive),
  });
  const res = await fetch(`${FIRE_MERGE_SERVICE_URL}/merged?${params}`);
  if (!res.ok) throw new Error(`fire-perimeters-merge HTTP ${res.status}`);
  const { perimeters, dots } = await res.json();
  if (!perimeters?.features || !dots?.features) throw new Error('Unexpected fire-perimeters-merge response');
  return { perimeters, dots };
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
  const prevPerimetersSigRef = useRef(null);
  const prevPerimetersRef = useRef(null);
  const prevDotsSigRef = useRef(null);
  const prevDotsRef = useRef(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setError(null);
      let merged, dots;
      if (FIRE_MERGE_SERVICE_URL) {
        ({ perimeters: merged, dots } = await fetchFromMergeService(minAcres, calFireIncludeInactive));
      } else {
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

        ({ perimeters: merged, dots } = mergeFireData(mergedPerimeters, incidents, calFiltered));
      }
      if (!mountedRef.current) return;

      // Keep the same object reference across polls when nothing actually
      // changed, so Mapbox's Source doesn't re-run setData()/re-tile the
      // whole layer (and downstream useMemo pipelines don't recompute) on a
      // refresh that only re-confirmed the existing data.
      const perimetersSig = computeFeatureSignature(merged);
      const perimetersToUse = perimetersSig === prevPerimetersSigRef.current
        ? prevPerimetersRef.current
        : merged;
      prevPerimetersSigRef.current = perimetersSig;
      prevPerimetersRef.current = perimetersToUse;

      const dotsSig = computeFeatureSignature(dots);
      const dotsToUse = dotsSig === prevDotsSigRef.current ? prevDotsRef.current : dots;
      prevDotsSigRef.current = dotsSig;
      prevDotsRef.current = dotsToUse;

      setPerimetersGeoJSON(perimetersToUse);
      setIncidentDotsGeoJSON(dotsToUse);
      setPerimetersCount(perimetersToUse.features.length);
      setDotsCount(dotsToUse.features.length);
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
