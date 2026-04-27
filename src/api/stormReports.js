/**
 * stormReports.js
 * NWS Local Storm Reports (LSR) for weather tracking — NOAA ArcGIS MapServer.
 * https://mapservices.weather.noaa.gov/vector/rest/services/obs/nws_local_storm_reports/MapServer
 *
 * Layer 0 = last 24h; we only query that sublayer, then keep points from the last 24 hours
 * (by report time, rolling from “now”). ~30 min refresh is typical for the service.
 */

import { getCached, setCached, invalidateCache } from '../utils/dataCache';

const NWS_LSR_MAPSERVER_24H_LAYER = 0;

export const NWS_LSR_MAPSERVER_BASE =
  'https://mapservices.weather.noaa.gov/vector/rest/services/obs/nws_local_storm_reports/MapServer';

const STORM_REPORTS_MAX_AGE_HOURS = 24;
const NWS_LSR_CHUNK = 2000;
const NWS_LSR_GEO_CHUNK = 500;
const NWS_LSR_GEOJSON_CACHE_KEY = 'nws-lsr:mapserver-geojson';
const NWS_LSR_GEOJSON_CACHE_MS = 30 * 60 * 1000;

function nwsLsrTypeFromDescription(descript) {
  const t = String(descript || '').toLowerCase();
  if (t.includes('torn')) return 'Tornado';
  if (t.includes('hail')) return 'Hail';
  if (t.includes('wnd') || t.includes('wind') || t.includes('tstm') || t.includes('thunder')) {
    return 'Wind';
  }
  return 'Wind';
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

/**
 * MapServer `valid_time` is often "YYYY-MM-DD HH:mm:ss+00" — ECMAScript Date rejects
 * "+00" (needs "+00:00"), so the rolling 24h filter must not use raw `new Date(valid_time)`.
 */
function parseNwsLsrValidTimeToMs(validTime) {
  if (validTime == null) return null;
  if (typeof validTime === 'number' && Number.isFinite(validTime)) return validTime;
  if (typeof validTime !== 'string') return null;
  let s = String(validTime).trim().replace(' ', 'T');
  // "+00" / "-05" style offsets are invalid in JS; normalize to "+00:00"
  if (/[+-]\d{2}$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) {
    s += ':00';
  }
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

function reportedAtToMs(f) {
  const p = f?.properties;
  if (!p) return null;
  const fromValid = parseNwsLsrValidTimeToMs(p.valid_time);
  if (fromValid != null) return fromValid;
  if (typeof p.lsr_validtime === 'number' && Number.isFinite(p.lsr_validtime)) {
    return p.lsr_validtime;
  }
  if (p.reportedAt) {
    const t = new Date(p.reportedAt).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function filterToPastHours(featureCollection, hours) {
  const maxAgeMs = hours * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  if (!featureCollection?.features) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: featureCollection.features
      .filter((f) => {
        const ms = reportedAtToMs(f);
        if (ms == null || !Number.isFinite(ms)) return false;
        return ms >= cutoff;
      })
      .map((f) => ({
        ...f,
        properties: { ...f.properties, nwsLsrWindow: `${hours}h` },
      })),
  };
}

/**
 * Fetches 24h LSR points from the MapServer, then keeps only the last 24 hours by report time.
 */
export async function fetchNwsLsrMapServerAsGeoJSON(options = {}) {
  const layerId = NWS_LSR_MAPSERVER_24H_LAYER;
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

  const oids = await fetchObjectIdsForLayer(layerId);
  if (oids.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  async function fetchGeometriesByIds(oids) {
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
        `${NWS_LSR_MAPSERVER_BASE}/${layerId}/query?` + params,
        init
      );
      out.push(...esriToGeojsonFeatures(resp));
    }
    return out;
  }

  const list = await fetchGeometriesByIds(oids);
  const byObjectId = new Map();
  for (const f of list) {
    const oid = f?.properties?.objectid;
    if (oid == null) continue;
    const orig = f.properties;
    f.properties = {
      id: `nws-lsr-24h-${oid}`,
      source: 'NWS LSR',
      nwsLsrWindow: '24h',
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
      reportedAt: (() => {
        const ms = parseNwsLsrValidTimeToMs(orig?.valid_time);
        if (ms != null) return new Date(ms).toISOString();
        if (typeof orig?.lsr_validtime === 'number' && Number.isFinite(orig.lsr_validtime)) {
          return new Date(orig.lsr_validtime).toISOString();
        }
        return '';
      })(),
    };
    byObjectId.set(oid, f);
  }

  return {
    type: 'FeatureCollection',
    features: Array.from(byObjectId.values()),
  };
}

/**
 * @internal Cached 24h MapServer GeoJSON; rolling 24h window applied on read
 * (see fetchNwsLsrMapServerForHook) so the cutoff stays "now" between refreshes.
 */
export async function fetchNwsLsrMapServerForHook(options = {}) {
  const cached = getCached(NWS_LSR_GEOJSON_CACHE_KEY);
  if (cached !== null) {
    return filterToPastHours(cached, STORM_REPORTS_MAX_AGE_HOURS);
  }
  const raw24h = await fetchNwsLsrMapServerAsGeoJSON(options);
  setCached(NWS_LSR_GEOJSON_CACHE_KEY, raw24h, NWS_LSR_GEOJSON_CACHE_MS);
  return filterToPastHours(raw24h, STORM_REPORTS_MAX_AGE_HOURS);
}

export function invalidateNwsLsrMapServerCache() {
  invalidateCache(NWS_LSR_GEOJSON_CACHE_KEY);
}
