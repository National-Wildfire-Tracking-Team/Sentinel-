/**
 * index.mjs
 * fire-perimeters-merge — Google Cloud Run service (HTTP).
 *
 * Every browser tab running the tracker independently fetches NIFC WFIGS
 * perimeters, NIFC FIRIS (CA) perimeters, IRWIN incident locations, and CAL
 * FIRE incidents, then runs a multi-pass name/ID/geometry matching pipeline
 * to merge them into one perimeter layer + one "unmatched incident" dot
 * layer (see src/app/hooks/useMergedFireData.js) — every 5 minutes, per
 * client. This service does that fetch + merge once, server-side, on a
 * short cache, so every client instead makes one small request for an
 * already-merged, already-deduped result.
 *
 * The merge logic below (getFireMatchKey, tagHistoricalMappings,
 * mergePerimeterSources, mergeFireData, and their small geometry helpers)
 * is a direct port of src/app/hooks/useMergedFireData.js — keep the two in
 * sync if the matching heuristics change. Likewise the per-source
 * fetch+normalize functions are ports of src/app/api/nifc.js,
 * src/app/api/inciweb.js, and src/app/api/calFire.js, minus the
 * browser-only CORS-workaround paths (this runs server-side, so CAL FIRE's
 * incidents.fire.ca.gov can be fetched directly — see calFire.js's own doc
 * comment: "works server-side / Node only").
 *
 * GET /merged?minAcres=<number>&includeInactive=<bool>
 */

import { createServer } from 'node:http';

const PORT = process.env.PORT || 8080;
const RAW_CACHE_TTL_MS = 3 * 60 * 1000; // fresher than the client's old 5-min poll

const NIFC_BASE =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services' +
  '/WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query';
const FIRIS_BASE =
  'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services' +
  '/CA_Perimeters_NIFC_FIRIS_public_view/FeatureServer/0/query';
const IRWIN_BASE =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services' +
  '/WFIGS_Incident_Locations_Current/FeatureServer/0/query';
const CAL_FIRE_GEOJSON_BASE = 'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(res, body, status = 200, extraHeaders = {}) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(body));
}

async function withRetry(fn, { attempts = 3, baseDelayMs = 1000, tag = '' } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        console.warn(`${tag} attempt ${i + 1}/${attempts} failed, retrying:`, err.message || err);
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** i));
      }
    }
  }
  throw lastError;
}

async function fetchJson(url, tag) {
  return withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }, { tag });
}

// ---------------------------------------------------------------------------
// NIFC WFIGS perimeters (with ArcGIS exceededTransferLimit paging) + FIRIS
// ---------------------------------------------------------------------------

function toCountOnlyUrl(url) {
  const u = new URL(url);
  u.searchParams.set('f', 'json');
  u.searchParams.set('returnCountOnly', 'true');
  return u.toString();
}

function pagedUrlFor(baseUrl, pageSize, offset) {
  return `${baseUrl}&orderByFields=OBJECTID&resultOffset=${offset}&resultRecordCount=${pageSize}`;
}

/** Fetches every ArcGIS page (see src/app/api/nifc.js's fetchAllPages for the original + rationale). */
async function fetchAllPages(baseUrl, tag) {
  const pageSize = 2000;
  const maxPages = 10;

  const [firstPage, countResult] = await Promise.all([
    fetchJson(pagedUrlFor(baseUrl, pageSize, 0), tag),
    fetchJson(toCountOnlyUrl(baseUrl), tag).catch(() => null),
  ]);

  if (firstPage?.error) throw new Error(firstPage.error.message || 'ArcGIS error');
  if (!firstPage?.features) throw new Error('Unexpected response format');

  let allFeatures = firstPage.features;
  const mightHaveMore = firstPage.properties?.exceededTransferLimit || firstPage.features.length >= pageSize;
  if (!mightHaveMore) return { ...firstPage, features: allFeatures };

  const totalCount = typeof countResult?.count === 'number' ? countResult.count : null;
  if (totalCount != null) {
    const capped = Math.min(totalCount, pageSize * maxPages);
    const offsets = [];
    for (let offset = pageSize; offset < capped; offset += pageSize) offsets.push(offset);
    const pages = await Promise.all(offsets.map((offset) => fetchJson(pagedUrlFor(baseUrl, pageSize, offset), tag)));
    pages.forEach((data) => {
      if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
      if (!data?.features) throw new Error('Unexpected response format');
      allFeatures = allFeatures.concat(data.features);
    });
    return { ...firstPage, features: allFeatures };
  }

  let offset = pageSize;
  for (let page = 1; page < maxPages; page++) {
    const data = await fetchJson(pagedUrlFor(baseUrl, pageSize, offset), tag);
    if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
    if (!data?.features) throw new Error('Unexpected response format');
    allFeatures = allFeatures.concat(data.features);
    if (!data.properties?.exceededTransferLimit && data.features.length < pageSize) break;
    offset += pageSize;
  }
  return { ...firstPage, features: allFeatures };
}

/** Port of nifc.js's normalizePerimeters — remaps attr_/poly_ fields to the flat schema. */
function normalizeNifcPerimeters(geojson) {
  return {
    ...geojson,
    features: geojson.features.map((f) => ({
      ...f,
      properties: {
        UniqueFireIdentifier: f.properties.attr_UniqueFireIdentifier || '',
        IncidentName: f.properties.attr_IncidentName || f.properties.poly_IncidentName || 'Unknown Fire',
        GISAcres: f.properties.poly_GISAcres || 0,
        PercentContained: f.properties.attr_PercentContained ?? 0,
        FireDiscoveryDateTime: f.properties.attr_FireDiscoveryDateTime,
        ModifiedOnDateTime: f.properties.attr_ModifiedOnDateTime_dt,
        POOState: f.properties.attr_POOState || '',
        POOCounty: f.properties.attr_POOCounty || '',
        IncidentManagementOrganization: f.properties.attr_IncidentManagementOrg || '',
        TotalIncidentPersonnel: f.properties.attr_TotalIncidentPersonnel || 0,
        IncidentTypeCategory: f.properties.attr_IncidentTypeCategory || 'WF',
        FireCause: f.properties.attr_FireCause || '',
      },
    })),
  };
}

/** Port of nifc.js's normalizeFIRISPerimeters. */
function normalizeFirisPerimeters(geojson) {
  return {
    ...geojson,
    features: geojson.features.map((f) => {
      const p = f.properties || {};
      return {
        ...f,
        properties: {
          UniqueFireIdentifier: p.GlobalID || p.irwinid || p.IRWINID || p.UniqueFireIdentifier || '',
          IncidentName: p.incident_name || p.IncidentName || p.INCIDENT_NAME || 'Unknown Fire',
          GISAcres: p.area_acres ?? p.gis_acres ?? p.GISAcres ?? p.GIS_ACRES ?? 0,
          PercentContained: p.perc_contnd ?? p.percent_contained ?? p.PercentContained ?? 0,
          FireDiscoveryDateTime: p.FireDiscoveryDate || p.fire_discovery_datetime || p.poly_DateCurrent || null,
          ModifiedOnDateTime: p.poly_DateCurrent || p.date_current || p.ModifiedOnDateTime || null,
          POOState: p.state || p.POOState || 'CA',
          POOCounty: p.county || p.POOCounty || '',
          IncidentManagementOrganization: p.mission || p.inci_mgmt_org || p.IncidentManagementOrganization || '',
          TotalIncidentPersonnel: p.total_personnel || p.TotalIncidentPersonnel || 0,
          IncidentTypeCategory: p.type || p.inc_type_cat || p.IncidentTypeCategory || 'WF',
          FireCause: p.fire_cause || p.FireCause || '',
          IncidentNumber: p.incident_number || '',
          Description: p.description || '',
          DisplayStatus: p.displayStatus || '',
          _source: p.source || 'FIRIS',
        },
      };
    }),
  };
}

async function fetchNifcPerimetersRaw() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: [
      'attr_UniqueFireIdentifier', 'attr_IncidentName', 'poly_IncidentName', 'poly_GISAcres',
      'attr_PercentContained', 'attr_FireDiscoveryDateTime', 'attr_ModifiedOnDateTime_dt',
      'attr_POOState', 'attr_POOCounty', 'attr_IncidentManagementOrg', 'attr_TotalIncidentPersonnel',
      'attr_IncidentTypeCategory', 'attr_FireCause',
    ].join(','),
    outSR: '4326',
    geometryPrecision: '5',
    f: 'geojson',
  });
  const data = await fetchAllPages(`${NIFC_BASE}?${params}`, '[NIFC]');
  return normalizeNifcPerimeters(data);
}

async function fetchFirisPerimetersRaw() {
  const params = new URLSearchParams({
    where: "displayStatus='Active'",
    outFields: [
      'GlobalID', 'type', 'source', 'mission', 'incident_name', 'incident_number',
      'area_acres', 'description', 'FireDiscoveryDate', 'poly_DateCurrent', 'displayStatus',
    ].join(','),
    outSR: '4326',
    geometryPrecision: '5',
    f: 'geojson',
  });
  const data = await fetchJson(`${FIRIS_BASE}?${params}`, '[FIRIS]');
  if (data?.error) throw new Error(data.error.message || 'ArcGIS FIRIS error');
  if (!data?.features) throw new Error('Unexpected FIRIS response format');
  return normalizeFirisPerimeters(data);
}

/** Port of inciweb.js's normalizeIncidentGeoJSON. */
function normalizeIrwinIncidents(geojson) {
  return {
    ...geojson,
    features: geojson.features
      .filter((f) => f.geometry)
      .map((f) => ({
        ...f,
        properties: {
          UniqueFireIdentifier: f.properties.UniqueFireIdentifier || '',
          IncidentName: f.properties.IncidentName || 'Unknown Fire',
          GISAcres: Math.round(f.properties.IncidentSize || 0),
          PercentContained: f.properties.PercentContained ?? 0,
          FireDiscoveryDateTime: f.properties.FireDiscoveryDateTime,
          ModifiedOnDateTime: f.properties.ModifiedOnDateTime_dt,
          POOState: (f.properties.POOState || '').replace('US-', ''),
          POOCounty: f.properties.POOCounty || '',
          TotalIncidentPersonnel: f.properties.TotalIncidentPersonnel || 0,
          FireCause: f.properties.FireCause || 'Under Investigation',
        },
      })),
  };
}

async function fetchIrwinIncidentsRaw() {
  const where = [`IncidentTypeCategory='WF'`, `IncidentSize>=0`, `ControlDateTime IS NULL`].join(' AND ');
  const params = new URLSearchParams({
    where,
    outFields: [
      'UniqueFireIdentifier', 'IncidentName', 'POOState', 'POOCounty', 'IncidentSize',
      'PercentContained', 'FireDiscoveryDateTime', 'ModifiedOnDateTime_dt', 'FireCause',
      'TotalIncidentPersonnel',
    ].join(','),
    orderByFields: 'IncidentSize DESC',
    f: 'geojson',
    outSR: '4326',
    returnGeometry: 'true',
  });
  const data = await fetchJson(`${IRWIN_BASE}?${params}`, '[IRWIN]');
  if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
  if (!data?.features) throw new Error('Unexpected response format');
  return normalizeIrwinIncidents(data);
}

/** Port of calFire.js's calFireFeatureToIncident. */
function calFireFeatureToIncident(f, index) {
  const p = f.properties || {};
  const coords = f.geometry?.coordinates;
  const lng = Array.isArray(coords) ? coords[0] : Number(p.Longitude);
  const lat = Array.isArray(coords) ? coords[1] : Number(p.Latitude);
  const acres = Math.round(Number(p.AcresBurned) || 0);
  const contained = Number(p.PercentContained ?? 0) || 0;
  return {
    id: p.UniqueId || `calfire-${index}`,
    name: p.Name || 'Unknown Fire',
    county: p.County || '',
    lat, lng, acres, contained,
    started: p.Started || p.StartedDateOnly ? new Date(p.Started || p.StartedDateOnly).toISOString() : null,
    updated: p.Updated ? new Date(p.Updated).toISOString() : null,
    cause: p.Type === 'Wildfire' ? 'Wildfire' : (p.Type || 'Wildfire'),
    contained_pct: contained,
    url: p.Url || null,
  };
}

async function fetchCalFireGeoJsonRaw(includeInactive) {
  const params = new URLSearchParams({ inactive: includeInactive ? 'true' : 'false' });
  const data = await fetchJson(`${CAL_FIRE_GEOJSON_BASE}?${params}`, '[CAL FIRE]');
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Unexpected CAL FIRE GeoJSON response');
  }
  return data;
}

// ---------------------------------------------------------------------------
// Merge pipeline — direct port of src/app/hooks/useMergedFireData.js
// ---------------------------------------------------------------------------

function getFireMatchKey(name) {
  if (!name) return null;
  const upper = name.toUpperCase().trim();
  if (upper === 'UNKNOWN' || upper === 'UNKNOWN FIRE' || upper === 'UNNAMED' || upper === '') return null;
  let key = upper;
  if (key.includes('/')) key = key.split('/').pop().trim();
  key = key.replace(/FIRE PERIMETER/g, '').replace(/PERIMETER/g, '').replace(/INCIDENT/g, '')
    .replace(/\bFIRE\b/g, '').replace(/\s+/g, '');
  if (key === 'UNKNOWN' || key === 'UNNAMED') return null;
  return key.length > 0 ? key : null;
}

function pointInRing(point, ring) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInRing(point, geometry.coordinates[0]);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((poly) => pointInRing(point, poly[0]));
  return false;
}

function geometryBBox(geometry) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visitRing = (ring) => ring.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  if (geometry?.type === 'Polygon') geometry.coordinates.forEach(visitRing);
  else if (geometry?.type === 'MultiPolygon') geometry.coordinates.forEach((poly) => poly.forEach(visitRing));
  return [minLng, minLat, maxLng, maxLat];
}

function pointNearGeometry(point, geometry, bufferDeg) {
  const [px, py] = point;
  const [minLng, minLat, maxLng, maxLat] = geometryBBox(geometry);
  return px >= minLng - bufferDeg && px <= maxLng + bufferDeg && py >= minLat - bufferDeg && py <= maxLat + bufferDeg;
}

function bboxArea([minLng, minLat, maxLng, maxLat]) {
  return Math.max(0, maxLng - minLng) * Math.max(0, maxLat - minLat);
}

function bboxIoU(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const interArea = ix * iy;
  if (interArea <= 0) return 0;
  const unionArea = bboxArea(a) + bboxArea(b) - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

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

function tagHistoricalMappings(perimeters) {
  const features = perimeters?.features;
  if (!features?.length || features.length < 2) return perimeters;

  const n = features.length;
  const bboxes = features.map((f) => geometryBBox(f.geometry));
  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    const idI = features[i].properties?.UniqueFireIdentifier;
    for (let j = i + 1; j < n; j++) {
      const idJ = features[j].properties?.UniqueFireIdentifier;
      const sameId = Boolean(idI) && idI === idJ;
      if (sameId || bboxIoU(bboxes[i], bboxes[j]) >= DUPLICATE_MAPPING_IOU_THRESHOLD) uf.union(i, j);
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }

  const mappingTime = (f) => {
    const t = new Date(f.properties.ModifiedOnDateTime || f.properties.FireDiscoveryDateTime || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  const historicalIdx = new Set();
  const inheritedName = new Map();
  groups.forEach((idxs) => {
    if (idxs.length < 2) return;
    const maxTime = Math.max(...idxs.map((idx) => mappingTime(features[idx])));
    idxs.forEach((idx) => {
      if (mappingTime(features[idx]) < maxTime) historicalIdx.add(idx);
    });

    let bestNamedIdx = null;
    idxs.forEach((idx) => {
      if (!getFireMatchKey(features[idx].properties.IncidentName)) return;
      if (bestNamedIdx === null || mappingTime(features[idx]) > mappingTime(features[bestNamedIdx])) bestNamedIdx = idx;
    });
    if (bestNamedIdx !== null) {
      idxs.forEach((idx) => {
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

function mergePerimeterSources(primary, secondary) {
  const primaryKeys = new Set();
  primary.features.forEach((f) => {
    const key = getFireMatchKey(f.properties.IncidentName);
    if (key) primaryKeys.add(key);
  });
  const addedFeatures = (secondary.features || []).filter((f) => {
    const key = getFireMatchKey(f.properties.IncidentName);
    return !key || !primaryKeys.has(key);
  });
  return { ...primary, features: [...primary.features, ...addedFeatures] };
}

function mergeFireData(perimeters, incidents, calFireDotsGeoJSON = null) {
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

  const incidentTime = (props) => {
    const t = new Date(props.ModifiedOnDateTime || props.FireDiscoveryDateTime || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  const featuresByKey = new Map();
  const noKeyFeatures = [];
  const considerIncident = (f) => {
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
    if (incidentTime(f.properties) > incidentTime(existing.properties)) featuresByKey.set(key, f);
  };
  incidents.features.forEach(considerIncident);
  calFeatures.forEach(considerIncident);

  const mergedIncidents = { ...incidents, features: [...featuresByKey.values(), ...noKeyFeatures] };
  const incidentsByKey = new Map();
  featuresByKey.forEach((f, key) => incidentsByKey.set(key, f.properties));

  const usedKeys = new Set();

  const incidentsById = new Map();
  mergedIncidents.features.forEach((f) => {
    const id = f.properties.UniqueFireIdentifier;
    if (id) incidentsById.set(id, f.properties);
  });

  const idMatchedFeatures = perimeters.features.map((f) => {
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
        TotalIncidentPersonnel: f.properties.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
      },
    };
  });

  const enrichedFeatures = idMatchedFeatures.map((f) => {
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
          TotalIncidentPersonnel: f.properties.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
        },
      };
    }
    return f;
  });

  const finalFeatures = enrichedFeatures.map((f) => {
    if (getFireMatchKey(f.properties.IncidentName) !== null) return f;
    const match = mergedIncidents.features.find((dot) => {
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
        UniqueFireIdentifier: inc.UniqueFireIdentifier || f.properties.UniqueFireIdentifier,
        FireCause: f.properties.FireCause || inc.FireCause || 'Undetermined',
        GISAcres: Math.max(f.properties.GISAcres || 0, inc.GISAcres || 0),
        TotalIncidentPersonnel: f.properties.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
      },
    };
  });

  const PROXIMITY_BUFFER_DEG = 0.05;
  const proximityFeatures = finalFeatures.map((f) => {
    if (getFireMatchKey(f.properties.IncidentName) !== null) return f;
    const match = mergedIncidents.features.find((dot) => {
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
        UniqueFireIdentifier: inc.UniqueFireIdentifier || f.properties.UniqueFireIdentifier,
        FireCause: f.properties.FireCause || inc.FireCause || 'Undetermined',
        GISAcres: Math.max(f.properties.GISAcres || 0, inc.GISAcres || 0),
        TotalIncidentPersonnel: f.properties.TotalIncidentPersonnel || inc.TotalIncidentPersonnel || 0,
      },
    };
  });

  const dotFeatures = mergedIncidents.features.filter((f) => {
    const key = getFireMatchKey(f.properties.IncidentName);
    return key && !usedKeys.has(key);
  });

  return {
    perimeters: { ...perimeters, features: proximityFeatures },
    dots: { type: 'FeatureCollection', features: dotFeatures },
  };
}

// ---------------------------------------------------------------------------
// Raw-source cache — one shared fetch of every upstream source regardless of
// per-request minAcres/includeInactive, refreshed at most every
// RAW_CACHE_TTL_MS; the acreage filter and the includeInactive branch are
// applied fresh on every request against this cache.
// ---------------------------------------------------------------------------

/** @type {Map<string, { data: object, fetchedAt: number }>} */
const rawCache = new Map();
/** @type {Map<string, Promise<object>>} */
const inFlight = new Map();

async function getRawCached(key, fetcher) {
  const cached = rawCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < RAW_CACHE_TTL_MS) return cached.data;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = fetcher()
    .then((data) => {
      rawCache.set(key, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function computeMerged({ minAcres, includeInactive }) {
  const [nifc, firis, incidents, calFireGeoJSON] = await Promise.all([
    getRawCached('nifc', fetchNifcPerimetersRaw),
    getRawCached('firis', fetchFirisPerimetersRaw),
    getRawCached('irwin', fetchIrwinIncidentsRaw),
    getRawCached(`calfire:${includeInactive}`, () => fetchCalFireGeoJsonRaw(includeInactive)).catch(() => ({
      type: 'FeatureCollection',
      features: [],
    })),
  ]);

  const nifcFiltered = { ...nifc, features: nifc.features.filter((f) => (f.properties.GISAcres || 0) >= minAcres) };
  const firisFiltered = minAcres > 0
    ? { ...firis, features: firis.features.filter((f) => (f.properties.GISAcres || 0) >= minAcres) }
    : firis;
  const incidentsFiltered = {
    ...incidents,
    features: incidents.features.filter((f) => (f.properties.GISAcres || 0) >= minAcres),
  };
  const calFiltered = {
    ...calFireGeoJSON,
    features: (calFireGeoJSON.features || []).filter((f) => (Number(f.properties?.AcresBurned) || 0) >= minAcres),
  };

  const mergedPerimeters = tagHistoricalMappings(mergePerimeterSources(nifcFiltered, firisFiltered));
  return mergeFireData(mergedPerimeters, incidentsFiltered, calFiltered);
}

async function handleMerged(url, res) {
  const minAcres = Number(url.searchParams.get('minAcres')) || 0;
  const includeInactive = url.searchParams.get('includeInactive') === 'true';
  try {
    const { perimeters, dots } = await computeMerged({ minAcres, includeInactive });
    jsonResponse(res, { perimeters, dots }, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (err) {
    jsonResponse(res, { error: err instanceof Error ? err.message : String(err) }, 502);
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    jsonResponse(res, { error: 'Method not allowed' }, 405);
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/merged') {
    await handleMerged(url, res);
    return;
  }
  if (url.pathname === '/health') {
    jsonResponse(res, { ok: true });
    return;
  }
  jsonResponse(res, { error: 'Not found' }, 404);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[fire-perimeters-merge] listening on ${PORT}`);
});
