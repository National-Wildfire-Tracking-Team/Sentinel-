/**
 * alerts.mjs
 * Ingestion, normalization and caching for the nws-alerts Cloud Run service.
 *
 * Produces one shared snapshot of every active NWS alert, built the same way
 * each Sentinel tab builds it today in src/app/hooks/useWeatherAlerts.js:
 *
 *   1. api.weather.gov /alerts/active (primary; all pages), normalized exactly
 *      as src/app/api/noaaWeather.js normalizeAlerts() does.
 *   2. The NOAA WWA MapServer supplement, ID-first, exactly as
 *      src/app/api/nwsMapServerAlerts.js does — geometry only for cap_ids the
 *      NWS API is missing, full-layer fallback if the diff can't be trusted.
 *
 * Both halves are deliberate copies rather than imports: every cloud/*
 * service is a self-contained deploy unit whose build context is its own
 * directory. If either client module changes, change its twin here too —
 * Tests/Vitest/nwsAlertsService.test.js pins the shared behavior.
 *
 * Nothing here touches the network directly; `fetchImpl` is injected so the
 * whole pipeline is unit-testable.
 */

import { createHash } from 'node:crypto';

export const SCHEMA_VERSION = 1;

export const DEFAULT_NWS_API_BASE = 'https://api.weather.gov';
export const DEFAULT_WWA_MAPSERVER =
  'https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer';

export const MAPSERVER_LAYERS = [0, 1];
export const ID_BATCH_SIZE = 50;

const ALERT_FIELDS = 'prod_type,sig,cap_id,issuance,expiration';
const CAP_ID_PATTERN = /^[A-Za-z0-9:._-]+$/;

// Pagination guard: api.weather.gov returns ~500 alerts per page, so this is
// far past any real alert count while still bounding a runaway cursor loop.
const MAX_NWS_PAGES = 20;

export class IngestError extends Error {}

// ─── Upstream fetch ─────────────────────────────────────────────────────────

/**
 * GET + parse JSON, recording upstream bytes and time into `stats`.
 * Bytes are the decoded body length — what we parsed, not what crossed the
 * wire (fetch has already undone any gzip by then).
 */
async function getJson(fetchImpl, url, { headers = {}, timeoutMs = 15000, stats } = {}) {
  const started = Date.now();
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new IngestError(`HTTP ${res.status}`);
  const text = await res.text();
  if (stats) {
    stats.upstreamRequests += 1;
    stats.upstreamBytes += text.length;
    stats.upstreamMs += Date.now() - started;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new IngestError('invalid JSON');
  }
}

// ─── api.weather.gov (primary) ──────────────────────────────────────────────

function extractPolygonCoords(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  if (geom.type === 'GeometryCollection') return geom.geometries.flatMap(extractPolygonCoords);
  return [];
}

/** Twin of flattenGeometry() in src/app/api/noaaWeather.js. */
export function flattenGeometry(geom) {
  const coords = extractPolygonCoords(geom);
  if (coords.length === 0) return null;
  if (coords.length === 1) return { type: 'Polygon', coordinates: coords[0] };
  return { type: 'MultiPolygon', coordinates: coords };
}

/** Twin of normalizeAlerts() in src/app/api/noaaWeather.js — same fields. */
export function normalizeAlert(f) {
  const p = f.properties;
  return {
    id: p.id || f.id,
    type: p.event,
    headline: p.headline,
    description: p.description,
    instruction: p.instruction,
    severity: p.severity,
    urgency: p.urgency,
    certainty: p.certainty,
    sent: p.sent,
    effective: p.effective,
    onset: p.onset,
    expires: p.expires,
    senderName: p.senderName,
    affectedArea: p.areaDesc,
    geocode: p.geocode,
    affectedZones: p.affectedZones || [],
    parameters: p.parameters,
    geometry: flattenGeometry(f.geometry),
  };
}

/**
 * Fetch every page of active alerts.
 *
 * `pagination.next` is only followed when it stays on the configured NWS
 * origin, so a malformed or hostile upstream response can't point this
 * service at an arbitrary host.
 */
export async function fetchActiveAlerts({ fetchImpl, baseUrl, userAgent, stats }) {
  const origin = new URL(baseUrl).origin;
  const headers = { 'User-Agent': userAgent, Accept: 'application/geo+json' };
  let url = `${baseUrl}/alerts/active?status=actual&message_type=alert,update`;
  const features = [];
  let pages = 0;

  while (url) {
    if (pages >= MAX_NWS_PAGES) throw new IngestError('pagination limit exceeded');
    const data = await getJson(fetchImpl, url, { headers, stats });
    if (!Array.isArray(data?.features)) throw new IngestError('malformed alerts response');
    features.push(...data.features);
    pages += 1;

    const next = data.pagination?.next;
    url = null;
    if (next) {
      const nextUrl = new URL(next, baseUrl);
      if (nextUrl.origin !== origin) throw new IngestError('pagination left the NWS origin');
      url = nextUrl.toString();
    }
  }

  // Same rule as fetchNWSAlerts(): an empty nationwide feed is treated as a
  // failure, not as "no alerts", so it can't overwrite a good snapshot.
  if (!features.length) throw new IngestError('no active alerts');
  return { alerts: features.map(normalizeAlert), pages };
}

// ─── WWA MapServer supplement (ID-first) ────────────────────────────────────

export function parseIdResponse(data) {
  if (!data || typeof data !== 'object' || data.error) return null;
  if (!Array.isArray(data.features)) return null;
  if (data.exceededTransferLimit) return null;
  const ids = [];
  for (const f of data.features) {
    const capId = f?.attributes?.cap_id;
    if (capId == null || capId === '') continue;
    if (typeof capId !== 'string' || !CAP_ID_PATTERN.test(capId)) return null;
    ids.push(capId);
  }
  return ids;
}

const isFeatureCollection = (d) =>
  Boolean(d) && typeof d === 'object' && !d.error && Array.isArray(d.features);

function sigToSeverity(sig) {
  if (sig === 'W') return 'Extreme';
  if (sig === 'A') return 'Severe';
  if (sig === 'Y') return 'Moderate';
  if (sig === 'S') return 'Minor';
  return 'Unknown';
}

function sigToUrgency(sig) {
  if (sig === 'W') return 'Immediate';
  if (sig === 'A') return 'Expected';
  return 'Unknown';
}

/** Twin of the MapServer normalization in src/app/api/nwsMapServerAlerts.js. */
export function toSupplementalAlert(f) {
  return {
    id: f.properties.cap_id || null,
    type: f.properties.prod_type || null,
    severity: sigToSeverity(f.properties.sig),
    urgency: sigToUrgency(f.properties.sig),
    geometry: f.geometry,
    geocode: null,
    source: 'NWS',
  };
}

export async function fetchMapServerSupplement({ fetchImpl, mapServerUrl, knownIds, stats }) {
  const ms = {
    mode: 'id-first',
    mapServerIds: 0,
    missingIds: 0,
    geometryRequests: 0,
    fallbackLayers: [],
  };
  const layerUrl = (id, qs) => `${mapServerUrl}/${id}/query?${qs}`;
  const fullQs = `where=1%3D1&outFields=${ALERT_FIELDS}&outSR=4326&f=geojson`;

  const full = async (id) => {
    ms.fallbackLayers.push(id);
    try {
      const data = await getJson(fetchImpl, layerUrl(id, fullQs), { timeoutMs: 30000, stats });
      return isFeatureCollection(data) ? data.features : [];
    } catch {
      return [];
    }
  };

  const layer = async (id) => {
    let ids;
    try {
      ids = parseIdResponse(await getJson(
        fetchImpl,
        layerUrl(id, 'where=1%3D1&outFields=cap_id&returnGeometry=false&returnDistinctValues=true&f=json'),
        { stats },
      ));
    } catch {
      ids = null;
    }
    if (ids === null) return full(id);

    ms.mapServerIds += ids.length;
    const missing = [...new Set(ids)].filter((x) => !knownIds.has(x));
    ms.missingIds += missing.length;
    if (!missing.length) return [];

    try {
      const batches = [];
      for (let i = 0; i < missing.length; i += ID_BATCH_SIZE) batches.push(missing.slice(i, i + ID_BATCH_SIZE));
      ms.geometryRequests += batches.length;
      const results = await Promise.all(batches.map((b) => {
        const where = encodeURIComponent(`cap_id IN (${b.map((x) => `'${x}'`).join(',')})`);
        return getJson(fetchImpl, layerUrl(id, `where=${where}&outFields=${ALERT_FIELDS}&outSR=4326&f=geojson`), { stats });
      }));
      if (!results.every(isFeatureCollection)) throw new IngestError('malformed geometry response');
      return results.flatMap((r) => r.features);
    } catch {
      return full(id);
    }
  };

  const features = (await Promise.all(MAPSERVER_LAYERS.map(layer))).flat();
  if (ms.fallbackLayers.length) ms.mode = 'fallback';

  // Server-side we can finish the de-dup the client would otherwise do, so
  // the fallback path doesn't ship already-known alerts to every browser.
  const supplemental = features
    .map(toSupplementalAlert)
    .filter((a) => a.id && !knownIds.has(a.id));

  return { supplemental, stats: ms };
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

/**
 * Build one complete snapshot. Throws (IngestError) only when the primary
 * NWS feed fails — the MapServer supplement is best-effort, as in the client.
 *
 * @returns {{ body: object, etag: string, stats: object }}
 */
export async function buildSnapshot({
  fetchImpl = fetch,
  nwsApiBase = DEFAULT_NWS_API_BASE,
  mapServerUrl = DEFAULT_WWA_MAPSERVER,
  userAgent,
  now = () => new Date(),
}) {
  const started = Date.now();
  const stats = { upstreamRequests: 0, upstreamBytes: 0, upstreamMs: 0 };

  const nwsStarted = Date.now();
  const { alerts, pages } = await fetchActiveAlerts({ fetchImpl, baseUrl: nwsApiBase, userAgent, stats });
  const nwsMs = Date.now() - nwsStarted;

  const knownIds = new Set(alerts.map((a) => a.id));
  const msStarted = Date.now();
  const { supplemental, stats: mapServer } = await fetchMapServerSupplement({
    fetchImpl, mapServerUrl, knownIds, stats,
  });
  const mapServerMs = Date.now() - msStarted;

  // The ETag covers content only (not generatedAt), so a client polling a
  // snapshot whose alerts haven't changed gets a 304 instead of the payload.
  const etag = `"${createHash('sha1').update(JSON.stringify([alerts, supplemental])).digest('base64url')}"`;

  const body = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now().toISOString(),
    stale: false,
    alerts,
    supplemental,
    counts: { alerts: alerts.length, supplemental: supplemental.length },
    sources: {
      nws: { pages, ms: nwsMs },
      mapServer: { ...mapServer, ms: mapServerMs },
    },
  };

  return {
    body,
    etag,
    stats: { ...stats, pages, ingestMs: Date.now() - started, mapServer },
  };
}

// ─── Shared short-lived cache ───────────────────────────────────────────────

/**
 * One snapshot shared by every request to this instance.
 *
 *   fresh    (age < ttlMs)          → served as-is                 'hit'
 *   expired  (age < ttlMs+maxStale) → rebuilt; if the rebuild
 *                                     fails, served with stale:true 'stale'
 *   too old / none                  → rebuilt; failure propagates   'miss'
 *
 * Concurrent requests during a rebuild share one upstream fetch
 * ('coalesced'). There is no background polling: an idle service makes no
 * upstream requests at all, which is the cost-control point.
 *
 * Unlike the CDN's stale-while-revalidate, an expired snapshot is never
 * served *instead of* trying upstream — only when upstream has just failed,
 * and only flagged as stale, so the client can say so.
 */
export class SnapshotCache {
  constructor({ ttlMs, maxStaleMs, build, now = Date.now }) {
    this.ttlMs = ttlMs;
    this.maxStaleMs = maxStaleMs;
    this.build = build;
    this.now = now;
    this.entry = null; // { snapshot, builtAt }
    this.inflight = null;
  }

  get ageMs() {
    return this.entry ? this.now() - this.entry.builtAt : null;
  }

  async get() {
    const age = this.ageMs;
    if (age !== null && age < this.ttlMs) {
      return { snapshot: this.entry.snapshot, cacheStatus: 'hit', ageMs: age };
    }

    if (this.inflight) {
      const result = await this.inflight;
      return { ...result, cacheStatus: result.cacheStatus === 'stale' ? 'stale' : 'coalesced' };
    }

    const refresh = this.refresh();
    this.inflight = refresh;
    try {
      return await refresh;
    } finally {
      if (this.inflight === refresh) this.inflight = null;
    }
  }

  async refresh() {
    try {
      const snapshot = await this.build();
      this.entry = { snapshot, builtAt: this.now() };
      return { snapshot, cacheStatus: 'miss', ageMs: 0 };
    } catch (err) {
      const staleAge = this.ageMs;
      if (staleAge !== null && staleAge < this.ttlMs + this.maxStaleMs) {
        const { snapshot } = this.entry;
        return {
          snapshot: { ...snapshot, body: { ...snapshot.body, stale: true } },
          cacheStatus: 'stale',
          ageMs: staleAge,
          error: err,
        };
      }
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
