/**
 * stormReports.js
 * Storm report data sources for weather tracking mode.
 *
 * Sources:
 * - NOAA SPC live reports JSON
 * - Iowa State Mesonet (IEM) SPC GeoJSON feed
 * - NWS Local Storm Reports (LSR) ArcGIS MapServer — 24/48/72h layers, ~30 min refresh
 */

import { fetchWithCache, getCached, setCached, invalidateCache } from '../utils/dataCache';

const SPC_REPORTS_URL = 'https://www.spc.noaa.gov/climo/reports/today.json';
const IEM_BASE_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/request/gis/spc.py';
/** NWS LSR point layers (0 = 24h, 1 = 48h, 2 = 72h) */
export const NWS_LSR_MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/vector/rest/services/obs/nws_local_storm_reports/MapServer';

function toIsoTimestamp(date, timeCandidate) {
  const hhmm = String(timeCandidate || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);
  const hh = hhmm.slice(0, 2);
  const mm = hhmm.slice(2, 4);
  return `${date}T${hh}:${mm}:00Z`;
}

function normalizeSpcRow(row, idx = 0) {
  const lat = Number(row.lat ?? row.latitude);
  const lng = Number(row.lon ?? row.lng ?? row.longitude);
  const reportTypeRaw = String(row.type || row.phenom || '').toLowerCase();
  
  const reportType = reportTypeRaw.includes('torn') ? 'Tornado'
    : reportTypeRaw.includes('hail') ? 'Hail'
    : 'Wind';

  const date = row.date ?? new Date().toISOString().slice(0, 10);
  const time = row.time ?? row.time_utc ?? row.utc ?? '0000';

  return {
    id: row.id || `spc-${date}-${time}-${idx}`,
    source: 'SPC',
    reportType,
    magnitude: row.magnitude || row.mag || row.size || row.f_scale || row.speed || null,
    city: row.city || row.location || '',
    county: row.county || '',
    state: row.state || '',
    comments: row.comments || row.remark || '',
    lat,
    lng,
    reportedAt: toIsoTimestamp(date, time),
  };
}

function nwsLsrTypeFromDescription(descript) {
  const t = String(descript || '').toLowerCase();
  if (t.includes('torn')) return 'Tornado';
  if (t.includes('hail')) return 'Hail';
  if (t.includes('wnd') || t.includes('wind') || t.includes('tstm') || t.includes('thunder')) return 'Wind';
  return 'Wind';
}

function normalizeIemFeature(feature, idx = 0) {
  const p = feature?.properties || {};
  const [lng, lat] = feature?.geometry?.coordinates || [NaN, NaN];
  const typetext = String(p.typetext || p.type || '').toLowerCase();

  const reportType = typetext.includes('torn') ? 'Tornado'
    : typetext.includes('hail') ? 'Hail'
    : 'Wind';

  const reportedAt = p.valid
    ? new Date(p.valid).toISOString()
    : toIsoTimestamp(new Date().toISOString().slice(0, 10), p.utcvalid || p.time || '0000');

  return {
    id: p.event_id || p.id || `iem-${reportedAt}-${idx}`,
    source: 'IEM',
    reportType,
    magnitude: p.magnitude || p.mag || p.size || null,
    city: p.city || p.town || '',
    county: p.county || '',
    state: p.state || '',
    comments: p.remark || p.comments || '',
    lat: Number(lat),
    lng: Number(lng),
    reportedAt,
  };
}

function esriToGeojsonFeatures(response) {
  const out = [];
  for (const f of response?.features || []) {
    const a = f.attributes;
    const g = f.geometry;
    if (a == null || g == null) continue;
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(g.x), Number(g.y)] },
      properties: { ...a },
    });
  }
  return out;
}

async function fetchNwsLsrMapServerJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`NWS LSR: HTTP ${res.status}`);
  return res.json();
}

// Added options parameter to accept { signal } from the hook
export async function fetchSpcStormReports(options = {}) {
  const data = await fetchWithCache(SPC_REPORTS_URL, 'spc:today-reports', { ...options }, 60 * 1000);

  // SPC today.json: { date, reports: { torn: [...], hail: [...], wind: [...] } }
  // Older/alternate formats may return reports as a flat array.
  let rows = [];
  if (Array.isArray(data)) {
    rows = data;
  } else if (Array.isArray(data?.reports)) {
    rows = data.reports;
  } else if (data?.reports && typeof data.reports === 'object') {
    const r = data.reports;
    rows = [
      ...(Array.isArray(r.torn) ? r.torn.map(row => ({ ...row, type: 'torn' })) : []),
      ...(Array.isArray(r.hail) ? r.hail.map(row => ({ ...row, type: 'hail' })) : []),
      ...(Array.isArray(r.wind) ? r.wind.map(row => ({ ...row, type: 'wind' })) : []),
    ];
  }

  return rows.map(normalizeSpcRow).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

// Added options parameter to accept { signal } from the hook
export async function fetchIemStormReports(options = {}) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');

  const params = new URLSearchParams({
    year: String(year),
    month,
    day,
    format: 'geojson',
  });

  const url = `${IEM_BASE_URL}?${params}`;
  const fetchOptions = { ...options };
  const data = await fetchWithCache(url, `iem:spc:${year}-${month}-${day}`, fetchOptions, 5 * 60 * 1000);
  const features = data?.features || [];
  return features.map(normalizeIemFeature).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

const NWS_LSR_LAYER_NAMES = { 0: '24h', 1: '48h', 2: '72h' };
const NWS_LSR_CHUNK = 2000;
const NWS_LSR_GEO_CHUNK = 500;
const NWS_LSR_GEOJSON_CACHE_KEY = 'nws-lsr:mapserver-geojson';
const NWS_LSR_GEOJSON_CACHE_MS = 30 * 60 * 1000;

/**
 * Fetches LSR point features from NWS MapServer (24h, 48h, 72h), one feature per
 * (layer, objectid), and returns GeoJSON in the same shape as stormReportsToGeoJSON.
 */
export async function fetchNwsLsrMapServerAsGeoJSON(options = {}) {
  const layerIds = [0, 1, 2];
  const { signal, ...rest } = options;
  const init = { ...rest, signal };

  async function fetchObjectIdsForLayer(lid) {
    const all = [];
    for (let i = 0; ; i++) {
      const from = i * NWS_LSR_CHUNK;
      const params = new URLSearchParams({
        where: '1=1',
        returnIdsOnly: 'true',
        f: 'json',
        resultOffset: String(from),
        resultRecordCount: String(NWS_LSR_CHUNK),
        orderByFields: 'objectid',
      });
      const data = await fetchNwsLsrMapServerJson(
        `${NWS_LSR_MAPSERVER_BASE}/${lid}/query?` + params,
        init
      );
      const ids = data?.objectIds;
      if (!Array.isArray(ids) || ids.length === 0) break;
      all.push(...ids);
      if (ids.length < NWS_LSR_CHUNK) break;
    }
    return all;
  }

  const idByLayer = await Promise.all(layerIds.map((lid) => fetchObjectIdsForLayer(lid)));

  async function fetchGeometriesByIds(lid, oids) {
    if (oids.length === 0) return [];
    const out = [];
    for (let s = 0; s < oids.length; s += NWS_LSR_GEO_CHUNK) {
      const chunk = oids.slice(s, s + NWS_LSR_GEO_CHUNK);
      const where = chunk.length === 1
        ? `objectid=${chunk[0]}`
        : `objectid IN (${chunk.join(',')})`;
      const params = new URLSearchParams({
        where,
        outFields: '*',
        returnGeometry: 'true',
        f: 'json',
        orderByFields: 'objectid',
      });
      const resp = await fetchNwsLsrMapServerJson(
        `${NWS_LSR_MAPSERVER_BASE}/${lid}/query?` + params,
        init
      );
      out.push(...esriToGeojsonFeatures(resp));
    }
    return out;
  }

  const geoByLayer = await Promise.all(
    layerIds.map((lid, i) => fetchGeometriesByIds(lid, idByLayer[i] || []))
  );

  const byKey = new Map();
  for (let li = 0; li < geoByLayer.length; li++) {
    for (const f of geoByLayer[li] || []) {
      const oid = f?.properties?.objectid;
      if (oid == null) continue;
      const k = `${NWS_LSR_LAYER_NAMES[layerIds[li]] || layerIds[li]}-${oid}`;
      const orig = f.properties;
      f.properties = {
        id: `nws-lsr-${k}`,
        source: 'NWS LSR',
        nwsLsrWindow: NWS_LSR_LAYER_NAMES[layerIds[li]] || String(layerIds[li]),
        reportType: nwsLsrTypeFromDescription(orig?.descript),
        magnitude: (() => {
          const m = String(orig?.magnitude ?? '').trim();
          if (!m) return '';
          const u = String(orig?.units ?? '').trim();
          return u ? `${m} ${u}` : m;
        })(),
        city: String(orig?.loc_desc || '').trim(),
        county: '',
        state: orig?.state || '',
        comments: orig?.remarks || '',
        wfo: orig?.wfo || orig?.wfo_id || '',
        lsrDescription: orig?.descript || '',
        reportedAt: orig?.valid_time
          ? (() => {
            try {
              return new Date(String(orig.valid_time).replace(' ', 'T'))
                .toISOString();
            } catch { return ''; }
          })()
          : (typeof orig?.lsr_validtime === 'number'
            ? new Date(orig.lsr_validtime).toISOString() : ''),
      };
      byKey.set(k, f);
    }
  }

  return {
    type: 'FeatureCollection',
    features: Array.from(byKey.values()),
  };
}

/**
 * @internal Cached GeoJSON for the NWS LSR map layer; used by useNwsLsrMapServer.
 */
export async function fetchNwsLsrMapServerForHook(options = {}) {
  const cached = getCached(NWS_LSR_GEOJSON_CACHE_KEY);
  if (cached !== null) return cached;
  const data = await fetchNwsLsrMapServerAsGeoJSON(options);
  setCached(NWS_LSR_GEOJSON_CACHE_KEY, data, NWS_LSR_GEOJSON_CACHE_MS);
  return data;
}

export function invalidateNwsLsrMapServerCache() {
  invalidateCache(NWS_LSR_GEOJSON_CACHE_KEY);
}

export function stormReportsToGeoJSON(reports = []) {
  return {
    type: 'FeatureCollection',
    features: reports.map((r) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.lng, r.lat],
      },
      properties: {
        id: r.id,
        source: r.source,
        reportType: r.reportType,
        magnitude: r.magnitude || '',
        city: r.city || '',
        county: r.county || '',
        state: r.state || '',
        comments: r.comments || '',
        reportedAt: r.reportedAt || '',
      },
    })),
  };
}
