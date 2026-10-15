/**
 * nhcModelTracks.js
 * "Spaghetti" model tracks for an active storm or invest, from NHC's public
 * ATCF guidance files (the "a-decks"), normalized by api/atcf/guidance.mjs
 * into one entry per registry model (HAFS-A/B, GFS, ECMWF, UKMET, CMC,
 * COAMPS-TC, the NHC official forecast, legacy HWRF/HMON — see
 * api/atcf/registry.mjs) plus the rest of the guidance by group.
 *
 * Two paths, same normalizer, same response:
 *  - VITE_HURRICANE_MODELS_URL set: the shared hurricane-models service
 *    (cloud/hurricane-models), which reads each a-deck once per change for
 *    everyone. Any failure there falls back to the browser path.
 *  - Otherwise: the a-deck through the /api/nws/nhc-atcf edge proxy
 *    (ftp.nhc.noaa.gov/atcf/aid_public), parsed here.
 *
 * Invests (pre-genesis disturbances, ATCF numbers 90-99) have a-decks too,
 * but NHC's outlook map layers don't carry the invest number, so
 * findInvestModelRun matches an outlook system to a recently updated invest
 * file by position.
 */

import { buildStormModels, parseStormId } from './atcf/guidance.mjs';
import { DEFAULT_MODEL_IDS, GUIDANCE_GROUPS, HURRICANE_MODELS, MODEL_ORDER } from './atcf/registry.mjs';

export { DEFAULT_MODEL_IDS, GUIDANCE_GROUPS, HURRICANE_MODELS, MODEL_ORDER };

export const HURRICANE_MODELS_URL = import.meta.env.VITE_HURRICANE_MODELS_URL || null;

const BASE = '/api/nws/nhc-atcf';
const NHC_ADECK_ORIGIN = 'https://ftp.nhc.noaa.gov/atcf/aid_public';
// The service revalidates every 5 minutes; asking more often gains nothing.
const TTL_MS = 5 * 60 * 1000;

const GROUP_COLORS = Object.fromEntries(GUIDANCE_GROUPS.map((g) => [g.key, g.color]));

/** What's drawn when spaghetti models are first shown: the official forecast and every operational model. */
export function defaultModelSelection() {
  return { models: [...DEFAULT_MODEL_IDS], groups: [] };
}

/** Keep only known ids, in registry order; anything missing gets the default. */
export function normalizeModelSelection(value) {
  const models = Array.isArray(value?.models)
    ? MODEL_ORDER.filter((id) => value.models.includes(id))
    : [...DEFAULT_MODEL_IDS];
  const groups = Array.isArray(value?.groups)
    ? GUIDANCE_GROUPS.map((g) => g.key).filter((k) => value.groups.includes(k))
    : [];
  return { models, groups };
}

/**
 * Selected tracks as GeoJSON: a line per model plus an end-of-track label
 * point, and a marker for where the storm is now. Lines carry their own
 * paint (color, dashed for legacy and stale runs, official drawn on top).
 */
export function modelTracksGeoJSON(data, selection = defaultModelSelection()) {
  const features = [];
  const { models, groups } = normalizeModelSelection(selection);
  const push = (points, properties) => {
    const coordinates = points.map((p) => [p.longitude, p.latitude]);
    if (coordinates.length < 2) return;
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties });
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coordinates[coordinates.length - 1] },
      properties: { ...properties, end: true },
    });
  };

  for (const g of data?.guidance ?? []) {
    if (!groups.includes(g.group)) continue;
    push(g.points, { id: g.id, label: g.id, kind: 'guidance', group: g.group, color: GROUP_COLORS[g.group], dashed: false, sortKey: 0 });
  }
  for (const m of data?.models ?? []) {
    if (!models.includes(m.id) || m.status === 'unavailable') continue;
    const official = m.category === 'official';
    push(m.points, {
      id: m.id,
      label: m.name,
      kind: official ? 'official' : 'model',
      category: m.category,
      status: m.status,
      color: HURRICANE_MODELS[m.id]?.color ?? '#cbd5e1',
      dashed: m.category === 'legacy' || m.status === 'stale',
      sortKey: official ? 2 : 1,
    });
  }
  const now = data?.currentPosition;
  if (features.length && now) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [now.longitude, now.latitude] },
      properties: { kind: 'current', time: now.time },
    });
  }
  return { type: 'FeatureCollection', features };
}

async function gunzipText(buffer) {
  const bytes = new Uint8Array(buffer);
  // Some hops decompress on the way; only inflate real gzip.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function fromService(storm, baseUrl) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/hurricanes/${storm.stormId}/models`);
  if (!res.ok) throw new Error(`hurricane-models HTTP ${res.status}`);
  const body = await res.json();
  if (body?.schemaVersion !== 1 || !Array.isArray(body.models)) throw new Error('hurricane-models: unexpected response');
  return { ...body, via: 'service' };
}

async function fromBrowser(storm) {
  const res = await fetch(`${BASE}/${storm.file}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await gunzipText(await res.arrayBuffer());
  const body = buildStormModels(text, storm, { source: { url: `${NHC_ADECK_ORIGIN}/${storm.file}` } });
  return { ...body, via: 'browser' };
}

const cache = new Map();

/** Tests only: forget cached responses and the invest listing. */
export function resetModelTrackCache() {
  cache.clear();
  indexCache = null;
}

/**
 * Normalized model guidance for a storm or invest (ATCF id, e.g.
 * "EP182026", "AL922026"). Concurrent callers share one request. Throws
 * when neither path works, so the caller can say so.
 */
export function fetchModelTracks(atcfId, { serviceUrl = HURRICANE_MODELS_URL } = {}) {
  const storm = parseStormId(atcfId);
  if (!storm) return Promise.reject(new Error(`Not an ATCF storm id: ${atcfId}`));
  const hit = cache.get(storm.stormId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = (async () => {
    if (serviceUrl) {
      try {
        return await fromService(storm, serviceUrl);
      } catch (err) {
        console.warn('[hurricane-models] service unavailable, reading the a-deck directly:', err.message);
      }
    }
    return fromBrowser(storm);
  })();
  cache.set(storm.stormId, { at: Date.now(), promise });
  promise.catch(() => cache.delete(storm.stormId));
  return promise;
}

/** True when the response has at least one track to draw. */
export function hasTracks(data) {
  return Boolean(data?.models?.some((m) => m.status !== 'unavailable' && m.points.length > 1) || data?.guidance?.length);
}

// ─── Invests ─────────────────────────────────────────────────────────────────

// An invest file NHC hasn't touched in this long belongs to an old system
// (numbers 90-99 are reused through the season).
const INVEST_MAX_AGE_MS = 36 * 3_600_000;
// How far (degrees) an invest's position can be from an outlook system and still be it.
const INVEST_MATCH_DEG = 5;

/**
 * Invest ids in NHC's a-deck directory listing updated within 36 hours:
 * ['AL922026', 'EP922026'].
 */
export function recentInvestIds(indexHtml, now = Date.now()) {
  const ids = [];
  for (const m of String(indexHtml ?? '').matchAll(/a((?:al|ep|cp)9\d\d{4})\.dat\.gz">[^<]*<\/a>\s+(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/g)) {
    const updated = Date.parse(`${m[2]}T${m[3]}:00Z`);
    if (Number.isFinite(updated) && now - updated <= INVEST_MAX_AGE_MS) ids.push(m[1].toUpperCase());
  }
  return ids;
}

let indexCache = null;

/**
 * The invest whose model guidance belongs to an outlook system at this
 * position: the nearest recently updated invest within 5°, or null (an area
 * of interest with nothing to track yet has no model runs).
 */
export async function findInvestModelRun({ lat, lng }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!indexCache || Date.now() - indexCache.at > TTL_MS) {
    const promise = fetch(`${BASE}/`).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
    indexCache = { at: Date.now(), promise };
    promise.catch(() => { indexCache = null; });
  }
  const ids = recentInvestIds(await indexCache.promise);
  const runs = await Promise.all(ids.map((id) => fetchModelTracks(id).then((data) => ({ id, data })).catch(() => null)));
  let best = null;
  for (const run of runs) {
    const p = run?.data?.currentPosition;
    if (!p || !hasTracks(run.data)) continue;
    const d = Math.hypot(p.latitude - lat, p.longitude - lng);
    if (d <= INVEST_MATCH_DEG && (!best || d < best.d)) best = { id: run.id, d };
  }
  return best?.id ?? null;
}
