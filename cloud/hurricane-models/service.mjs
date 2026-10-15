/**
 * service.mjs
 * hurricane-models — the request handling and caches behind index.mjs,
 * kept apart from the HTTP listener so Tests/Vitest can drive it with a
 * fake fetch.
 *
 * Upstreams are fixed here, never taken from the caller: a storm id is
 * validated (guidance.mjs parseStormId) and only then turned into a file
 * name on ftp.nhc.noaa.gov.
 */

import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  SCHEMA_VERSION, buildModelResponse, indexADeck, parseStormId, toCycle,
} from './guidance.mjs';

export { SCHEMA_VERSION };

export const NHC_FTP_ORIGIN = 'https://ftp.nhc.noaa.gov';
export const CURRENT_STORMS_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';

// Archived seasons run to ~30 MB of text per storm; anything far past that isn't an a-deck.
const MAX_DECK_BYTES = 150 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;

/**
 * Where a storm's a-deck lives: the current season in atcf/aid_public,
 * earlier ones in atcf/archive/<year>. Last season is tried in both, since
 * NHC moves files to the archive some time after the season ends.
 */
export function adeckUrls(storm, currentYear) {
  const live = `${NHC_FTP_ORIGIN}/atcf/aid_public/${storm.file}`;
  const archive = `${NHC_FTP_ORIGIN}/atcf/archive/${storm.year}/${storm.file}`;
  if (storm.year >= currentYear) return [live];
  if (storm.year === currentYear - 1) return [archive, live];
  return [archive];
}

/** NHC serves the decks gzipped as files (no Content-Encoding); only inflate real gzip. */
export function decodeDeck(buffer) {
  const bytes = Buffer.from(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzipSync(bytes, { maxOutputLength: MAX_DECK_BYTES }).toString('utf8');
  if (bytes.length > MAX_DECK_BYTES) throw new Error('a-deck too large');
  return bytes.toString('utf8');
}

export class NotFoundError extends Error {}

/**
 * Per-storm cache of parsed a-decks.
 *
 * - Fresh for `ttlMs`; after that the next request revalidates with
 *   If-None-Match / If-Modified-Since, so an unchanged deck costs NHC a 304
 *   and us no re-download or re-parse.
 * - Concurrent requests for the same storm share one upstream fetch.
 * - If NHC fails, the last good deck is served flagged stale for up to
 *   `maxStaleMs` past its TTL, then the storm returns 502 rather than keep
 *   presenting old guidance as current.
 * - Holds at most `maxEntries` storms and `maxRecords` parsed a-deck lines
 *   in total (an archived season's deck is ~10x a live one); the least
 *   recently used storm goes first. It also
 *   remembers ids NHC has no file for (`missTtlMs`) so a bad id can't make
 *   us hammer the upstream.
 */
export class StormStore {
  constructor({
    fetchImpl = fetch, now = Date.now, log = () => {}, ttlMs, maxStaleMs, maxEntries = 32, maxRecords = 2_000_000,
    missTtlMs = 5 * 60 * 1000, userAgent, currentYear = () => new Date(now()).getUTCFullYear(),
  }) {
    Object.assign(this, { fetchImpl, now, log, ttlMs, maxStaleMs, maxEntries, maxRecords, missTtlMs, userAgent, currentYear });
    this.entries = new Map();
    this.misses = new Map();
    this.inflight = new Map();
    this.counters = { hits: 0, misses: 0, revalidated: 0, coalesced: 0, stale: 0, fetches: 0, fetchFailures: 0, parseFailures: 0, notFound: 0 };
  }

  get size() {
    return this.entries.size;
  }

  /** @returns {Promise<{ entry, cacheStatus: 'hit'|'miss'|'revalidated'|'coalesced'|'stale' }>} */
  async get(storm) {
    const id = storm.stormId;
    const entry = this.entries.get(id);
    if (entry && this.now() - entry.checkedAt < this.ttlMs) {
      this.counters.hits += 1;
      this.touch(id, entry);
      return { entry, cacheStatus: 'hit' };
    }
    const missUntil = this.misses.get(id);
    if (!entry && missUntil && missUntil > this.now()) {
      this.counters.notFound += 1;
      throw new NotFoundError(`No ATCF guidance file for ${id}`);
    }
    if (this.inflight.has(id)) {
      this.counters.coalesced += 1;
      const result = await this.inflight.get(id);
      return { ...result, cacheStatus: result.cacheStatus === 'stale' ? 'stale' : 'coalesced' };
    }
    const refresh = this.refresh(storm, entry);
    this.inflight.set(id, refresh);
    try {
      return await refresh;
    } finally {
      this.inflight.delete(id);
    }
  }

  /** Drop least recently used storms until both budgets hold (the newest always stays). */
  evict() {
    let records = 0;
    for (const e of this.entries.values()) records += e.index.stats.records;
    while (this.entries.size > 1 && (this.entries.size > this.maxEntries || records > this.maxRecords)) {
      const [oldestId, oldest] = this.entries.entries().next().value;
      records -= oldest.index.stats.records;
      this.entries.delete(oldestId);
      this.log('INFO', 'storm_evicted', { stormId: oldestId, records: oldest.index.stats.records });
    }
  }

  touch(id, entry) {
    this.entries.delete(id);
    this.entries.set(id, entry);
  }

  async refresh(storm, prev) {
    const id = storm.stormId;
    try {
      const fetched = await this.fetchDeck(storm, prev);
      if (fetched.notModified) {
        prev.checkedAt = this.now();
        this.touch(id, prev);
        this.counters.revalidated += 1;
        this.log('INFO', 'adeck_not_modified', { stormId: id, latestCycle: prev.index.latestCycle });
        return { entry: prev, cacheStatus: 'revalidated' };
      }
      const entry = this.ingest(storm, fetched, prev);
      this.touch(id, entry);
      this.evict();
      this.misses.delete(id);
      this.counters.misses += 1;
      return { entry, cacheStatus: 'miss' };
    } catch (err) {
      if (err instanceof NotFoundError) {
        this.counters.notFound += 1;
        this.misses.set(id, this.now() + this.missTtlMs);
        this.log('INFO', 'adeck_not_found', { stormId: id });
        throw err;
      }
      const age = prev ? this.now() - prev.checkedAt : null;
      if (prev && age < this.ttlMs + this.maxStaleMs) {
        this.counters.stale += 1;
        this.log('WARNING', 'adeck_refresh_failed_serving_stale', { stormId: id, error: String(err?.message || err), staleAgeMs: age });
        return { entry: prev, cacheStatus: 'stale' };
      }
      this.log('ERROR', 'adeck_unavailable', { stormId: id, error: String(err?.message || err) });
      throw err;
    }
  }

  async fetchDeck(storm, prev) {
    const urls = adeckUrls(storm, this.currentYear());
    for (const url of urls) {
      const headers = { Accept: 'application/gzip, application/x-gzip, text/plain, */*' };
      if (this.userAgent) headers['User-Agent'] = this.userAgent;
      if (prev && prev.source.url === url) {
        if (prev.source.etag) headers['If-None-Match'] = prev.source.etag;
        if (prev.source.lastModified) headers['If-Modified-Since'] = new Date(prev.source.lastModified).toUTCString();
      }
      this.counters.fetches += 1;
      const started = this.now();
      let res;
      try {
        res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      } catch (err) {
        this.counters.fetchFailures += 1;
        this.log('ERROR', 'noaa_fetch_failed', { stormId: storm.stormId, url, error: String(err?.message || err) });
        throw err;
      }
      if (res.status === 304) return { notModified: true };
      if (res.status === 404) continue;
      if (!res.ok) {
        this.counters.fetchFailures += 1;
        this.log('ERROR', 'noaa_fetch_failed', { stormId: storm.stormId, url, status: res.status });
        throw new Error(`NHC returned HTTP ${res.status}`);
      }
      const buffer = await res.arrayBuffer();
      const lastModifiedHeader = res.headers.get('last-modified');
      const lastModifiedMs = lastModifiedHeader ? Date.parse(lastModifiedHeader) : NaN;
      return {
        url,
        buffer,
        etag: res.headers.get('etag'),
        lastModified: Number.isFinite(lastModifiedMs) ? new Date(lastModifiedMs).toISOString().replace('.000Z', 'Z') : null,
        fetchMs: this.now() - started,
      };
    }
    throw new NotFoundError(`No ATCF guidance file for ${storm.stormId}`);
  }

  ingest(storm, fetched, prev) {
    const started = this.now();
    let index;
    try {
      index = indexADeck(decodeDeck(fetched.buffer), storm);
    } catch (err) {
      this.counters.parseFailures += 1;
      this.log('ERROR', 'adeck_parse_failed', { stormId: storm.stormId, bytes: fetched.buffer.byteLength, error: String(err?.message || err) });
      throw err;
    }
    if (index.stats.records === 0) {
      this.counters.parseFailures += 1;
      this.log('ERROR', 'adeck_parse_failed', { stormId: storm.stormId, bytes: fetched.buffer.byteLength, error: 'no usable records', malformed: index.stats.malformed });
      throw new Error('a-deck had no usable records');
    }
    const builtAt = this.now();
    const entry = {
      index,
      source: { url: fetched.url, etag: fetched.etag, lastModified: fetched.lastModified },
      builtAt,
      checkedAt: builtAt,
      version: (prev?.version ?? 0) + 1,
    };
    // Counts and cycles only — never raw NOAA lines.
    this.log('INFO', 'adeck_ingested', {
      stormId: storm.stormId,
      bytes: fetched.buffer.byteLength,
      fetchMs: fetched.fetchMs,
      parseMs: builtAt - started,
      latestCycle: index.latestCycle,
      ...index.stats,
    });
    this.logModelChanges(storm, entry, prev);
    return entry;
  }

  logModelChanges(storm, entry, prev) {
    const now = this.now();
    const current = buildModelResponse(entry.index, { now });
    const before = prev ? buildModelResponse(prev.index, { now }) : null;
    if (before && before.latestCycle !== current.latestCycle) {
      this.log('INFO', 'cycle_change', { stormId: storm.stormId, from: before.latestCycle, to: current.latestCycle });
    }
    for (const m of current.models) {
      const old = before?.models.find((x) => x.id === m.id);
      if (old && old.initTime !== m.initTime) {
        this.log('INFO', 'model_cycle_change', { stormId: storm.stormId, model: m.id, from: old.initTime, to: m.initTime });
      }
    }
    const byStatus = (s) => current.models.filter((m) => m.status === s).map((m) => m.id);
    this.log('INFO', 'model_availability', {
      stormId: storm.stormId,
      asOf: current.asOf,
      available: byStatus('available'),
      stale: byStatus('stale'),
      unavailable: byStatus('unavailable'),
      points: Object.fromEntries(current.models.map((m) => [m.id, m.points.length])),
      guidanceTracks: current.guidance.length,
    });
  }
}

/**
 * NHC's CurrentStorms.json → the active storms, normalized. Fields NHC
 * leaves out come back null; entries without a valid ATCF id are dropped.
 */
export function normalizeActiveStorms(json) {
  const storms = [];
  for (const s of Array.isArray(json?.activeStorms) ? json.activeStorms : []) {
    const storm = parseStormId(s?.id);
    if (!storm) continue;
    const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    storms.push({
      stormId: storm.stormId,
      basin: storm.basin,
      stormNumber: storm.stormNumber,
      year: storm.year,
      name: typeof s.name === 'string' ? s.name : null,
      classification: typeof s.classification === 'string' ? s.classification : null,
      intensityKt: num(s.intensity),
      pressureMb: num(s.pressure),
      latitude: num(s.latitudeNumeric),
      longitude: num(s.longitudeNumeric),
      movementDirDeg: num(s.movementDir),
      movementSpeedKt: num(s.movementSpeed),
      lastUpdate: typeof s.lastUpdate === 'string' ? s.lastUpdate : null,
      binNumber: typeof s.binNumber === 'string' ? s.binNumber : null,
      modelsPath: `/v1/hurricanes/${storm.stormId}/models`,
    });
  }
  return storms;
}

/** Single-snapshot cache for the active-storm list, same stale-on-error rule as StormStore. */
export class ActiveStormsCache {
  constructor({ fetchImpl = fetch, now = Date.now, log = () => {}, ttlMs, maxStaleMs, userAgent }) {
    Object.assign(this, { fetchImpl, now, log, ttlMs, maxStaleMs, userAgent });
    this.entry = null;
    this.inflight = null;
  }

  async get() {
    if (this.entry && this.now() - this.entry.builtAt < this.ttlMs) return { ...this.entry, cacheStatus: 'hit' };
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }

  async refresh() {
    try {
      const headers = { Accept: 'application/json' };
      if (this.userAgent) headers['User-Agent'] = this.userAgent;
      const res = await this.fetchImpl(CURRENT_STORMS_URL, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`NHC returned HTTP ${res.status}`);
      const storms = normalizeActiveStorms(await res.json());
      this.entry = { storms, builtAt: this.now() };
      this.log('INFO', 'active_storms_refreshed', { storms: storms.length, ids: storms.map((s) => s.stormId) });
      return { ...this.entry, cacheStatus: 'miss' };
    } catch (err) {
      if (this.entry && this.now() - this.entry.builtAt < this.ttlMs + this.maxStaleMs) {
        this.log('WARNING', 'active_storms_refresh_failed_serving_stale', { error: String(err?.message || err) });
        return { ...this.entry, cacheStatus: 'stale' };
      }
      this.log('ERROR', 'noaa_fetch_failed', { url: CURRENT_STORMS_URL, error: String(err?.message || err) });
      throw err;
    }
  }
}

export class RateLimiter {
  constructor({ limit, windowMs, now = Date.now }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.windowStart = now();
    this.counts = new Map();
  }

  allow(clientKey) {
    const t = this.now();
    if (t - this.windowStart >= this.windowMs) {
      this.windowStart = t;
      this.counts.clear();
    }
    const n = (this.counts.get(clientKey) || 0) + 1;
    this.counts.set(clientKey, n);
    return n <= this.limit;
  }
}

const MODELS_PATH = /^\/v1\/hurricanes\/([^/]+)\/models\/?$/;

/**
 * The request router, transport-free: (method, url, headers) → { status,
 * body, headers }. index.mjs adds CORS, gzip and the socket.
 */
export function createRouter({ store, activeStorms, limiter, log = () => {}, now = Date.now, historicalMaxAgeS = 3600 }) {
  const counters = { requests: 0, badRequests: 0, notModified: 0, rateLimited: 0 };
  const rendered = new Map(); // memoized bodies: key → { json, etag }

  function render(key, body) {
    let hit = rendered.get(key);
    if (!hit) {
      const json = JSON.stringify(body);
      hit = { json, etag: `"${createHash('sha1').update(json).digest('base64url').slice(0, 27)}"` };
      rendered.set(key, hit);
      if (rendered.size > 128) rendered.delete(rendered.keys().next().value);
    }
    return hit;
  }

  const bad = (error) => {
    counters.badRequests += 1;
    return { status: 400, body: { error }, headers: { 'Cache-Control': 'no-store' } };
  };

  async function models(rawId, search, ifNoneMatch) {
    let decoded;
    try { decoded = decodeURIComponent(rawId); } catch { decoded = ''; }
    const storm = parseStormId(decoded);
    if (!storm) return bad('Invalid storm id. Expected an NHC ATCF id such as AL092026 (basin AL, EP or CP).');
    if (storm.year > new Date(now()).getUTCFullYear()) return bad('Storm year is in the future.');
    for (const key of search.keys()) {
      if (key !== 'cycle') return bad(`Unknown query parameter: ${key.slice(0, 40)}`);
    }
    const rawCycle = search.get('cycle');
    const cycle = rawCycle === null ? null : toCycle(rawCycle);
    if (rawCycle !== null && !cycle) return bad('Invalid cycle. Use YYYYMMDDHH or an ISO time on the hour, e.g. 2026-10-08T06:00:00Z.');

    let result;
    try {
      result = await store.get(storm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { status: 404, body: { error: `No NHC model guidance found for ${storm.stormId}.` }, headers: { 'Cache-Control': 'no-store' } };
      }
      return { status: 502, body: { error: 'NOAA hurricane model data is temporarily unavailable.' }, headers: { 'Cache-Control': 'no-store' } };
    }
    const { entry, cacheStatus } = result;
    const historical = storm.year < new Date(now()).getUTCFullYear();
    const stale = cacheStatus === 'stale';
    // The hour bucket lets a deck that stops updating turn 'no-recent-guidance' stale on time.
    const key = `${storm.stormId}|${cycle ?? ''}|${entry.version}|${stale}|${Math.floor(now() / 3_600_000)}`;
    let hit = rendered.get(key);
    if (!hit) {
      const body = buildModelResponse(entry.index, {
        asOf: cycle, now: now(), generatedAt: entry.builtAt, source: entry.source, historical,
      });
      if (!body) {
        return {
          status: 404,
          body: { error: `No guidance cycle ${cycle} for ${storm.stormId}.`, cycles: entry.index.cycles.slice(0, 20) },
          headers: { 'Cache-Control': 'no-store' },
        };
      }
      if (stale) Object.assign(body, { stale: true, staleReason: 'upstream-unavailable' });
      hit = render(key, body);
    }
    // Live data: shared caches may hold it for what's left of the TTL. A
    // pinned cycle or past season doesn't change. A stale body is never cached.
    const remaining = Math.max(0, Math.floor((store.ttlMs - (now() - entry.checkedAt)) / 1000));
    const cacheControl = stale ? 'no-store'
      : (historical || cycle) ? `public, max-age=0, s-maxage=${historicalMaxAgeS}, must-revalidate`
        : `public, max-age=0, s-maxage=${remaining}, must-revalidate`;
    const headers = { 'Cache-Control': cacheControl, ETag: hit.etag, 'X-Sentinel-Cache': cacheStatus };
    if (!stale && ifNoneMatch === hit.etag) {
      counters.notModified += 1;
      return { status: 304, body: null, headers };
    }
    return { status: 200, json: hit.json, headers, logFields: { stormId: storm.stormId, cycle, cacheStatus } };
  }

  async function active() {
    try {
      const { storms, builtAt, cacheStatus } = await activeStorms.get();
      const stale = cacheStatus === 'stale';
      return {
        status: 200,
        body: {
          schemaVersion: SCHEMA_VERSION,
          source: CURRENT_STORMS_URL,
          updatedAt: new Date(builtAt).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          stale,
          storms,
        },
        headers: { 'Cache-Control': stale ? 'no-store' : 'public, max-age=0, s-maxage=60, must-revalidate', 'X-Sentinel-Cache': cacheStatus },
        logFields: { storms: storms.length, cacheStatus },
      };
    } catch {
      return { status: 502, body: { error: 'NOAA active storm list is temporarily unavailable.' }, headers: { 'Cache-Control': 'no-store' } };
    }
  }

  async function route({ method, url, headers = {}, clientKey = 'unknown' }) {
    if (method !== 'GET') return { status: 405, body: { error: 'Method not allowed' }, headers: { Allow: 'GET, OPTIONS' } };
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    if (pathname === '/health') {
      return {
        status: 200,
        body: { ok: true, schemaVersion: SCHEMA_VERSION, cachedStorms: store.size, counters: { ...counters, ...store.counters } },
        headers: { 'Cache-Control': 'no-store' },
      };
    }
    counters.requests += 1;
    if (!limiter.allow(clientKey)) {
      counters.rateLimited += 1;
      log('WARNING', 'rate_limited');
      return { status: 429, body: { error: 'Too many requests — please slow down.' }, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } };
    }
    if (pathname === '/v1/hurricanes' || pathname === '/v1/hurricanes/') {
      if ([...searchParams.keys()].length) return bad('This endpoint takes no query parameters.');
      return active();
    }
    const m = pathname.match(MODELS_PATH);
    if (m) return models(m[1], searchParams, headers['if-none-match']);
    return { status: 404, body: { error: 'Not found' }, headers: {} };
  }

  return { route, counters };
}

/** gzip when the client takes it and it's worth it. */
export function encodeBody(payload, acceptEncoding = '') {
  if (payload.length > 1024 && /\bgzip\b/.test(acceptEncoding)) return { data: gzipSync(payload), encoding: 'gzip' };
  return { data: payload, encoding: null };
}
