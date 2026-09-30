/**
 * index.mjs
 * nws-alerts — Google Cloud Run service (HTTP).
 *
 * The first piece of Sentinel's Google Cloud data layer for NWS. Instead of
 * every browser tab pulling api.weather.gov and the NOAA WWA MapServer every
 * 60 seconds, this service builds one normalized snapshot (see alerts.mjs),
 * holds it for NWS_ALERTS_CACHE_TTL_SECONDS, and serves it to everyone.
 *
 * GET /v1/alerts  → { schemaVersion, generatedAt, stale, alerts, supplemental, counts, sources }
 * GET /health     → aggregate counters, no alert data
 *
 * Not yet wired into the frontend. The Netlify path (/api/wx + /api/nws/wwa)
 * stays the production source until this has been verified side by side —
 * see README.md.
 */

import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import {
  DEFAULT_NWS_API_BASE,
  DEFAULT_WWA_MAPSERVER,
  RateLimiter,
  SCHEMA_VERSION,
  SnapshotCache,
  buildSnapshot,
} from './alerts.mjs';

const PORT = process.env.PORT || 8080;

// Same 45s life-safety window as the Netlify edge tier and the client's own
// in-tab cache (src/app/api/noaaWeather.js LIFE_SAFETY_CACHE_MS).
const CACHE_TTL_MS = Number(process.env.NWS_ALERTS_CACHE_TTL_SECONDS || 45) * 1000;
// If a rebuild fails, the last good snapshot may be served — flagged
// stale:true — for at most this long past its TTL. After that the service
// returns 502 rather than keep presenting old warnings as current.
const MAX_STALE_MS = Number(process.env.NWS_ALERTS_MAX_STALE_SECONDS || 300) * 1000;
const RATE_LIMIT_PER_MINUTE = Number(process.env.NWS_ALERTS_RATE_LIMIT_PER_MINUTE || 120);

const NWS_API_BASE = process.env.NWS_API_BASE || DEFAULT_NWS_API_BASE;
const WWA_MAPSERVER_URL = process.env.WWA_MAPSERVER_URL || DEFAULT_WWA_MAPSERVER;
// api.weather.gov asks every client to identify itself with a contact. Set
// NWS_USER_AGENT to include one (e.g. an ops mailbox) at deploy time.
const USER_AGENT = process.env.NWS_USER_AGENT
  || 'SentinelWildfireTracker/1.0 (+https://app.nationalwildfiretrackingteam.org)';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Cloud Run sets K_REVISION on every revision; handy for correlating logs.
const REVISION = process.env.K_REVISION || 'local';

const counters = {
  requests: 0,
  notModified: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheCoalesced: 0,
  cacheStale: 0,
  ingestFailures: 0,
  rateLimited: 0,
  upstreamRequests: 0,
};

function log(severity, message, fields = {}) {
  console.log(JSON.stringify({ severity, message, component: 'nws-alerts', revision: REVISION, ...fields }));
}

const cache = new SnapshotCache({
  ttlMs: CACHE_TTL_MS,
  maxStaleMs: MAX_STALE_MS,
  build: async () => {
    try {
      const snapshot = await buildSnapshot({
        nwsApiBase: NWS_API_BASE,
        mapServerUrl: WWA_MAPSERVER_URL,
        userAgent: USER_AGENT,
      });
      counters.upstreamRequests += snapshot.stats.upstreamRequests;
      // Counts and timings only — never alert payloads.
      log('INFO', 'ingest', {
        alerts: snapshot.body.counts.alerts,
        supplemental: snapshot.body.counts.supplemental,
        nwsPages: snapshot.stats.pages,
        mapServerMode: snapshot.stats.mapServer.mode,
        mapServerIds: snapshot.stats.mapServer.mapServerIds,
        mapServerMissingIds: snapshot.stats.mapServer.missingIds,
        mapServerGeometryRequests: snapshot.stats.mapServer.geometryRequests,
        mapServerFallbackLayers: snapshot.stats.mapServer.fallbackLayers,
        upstreamRequests: snapshot.stats.upstreamRequests,
        upstreamBytes: snapshot.stats.upstreamBytes,
        upstreamMs: snapshot.stats.upstreamMs,
        ingestMs: snapshot.stats.ingestMs,
      });
      return snapshot;
    } catch (err) {
      counters.ingestFailures += 1;
      log('ERROR', 'ingest_failed', { error: String(err?.message || err) });
      throw err;
    }
  },
});

const limiter = new RateLimiter({ limit: RATE_LIMIT_PER_MINUTE, windowMs: 60 * 1000 });

function corsHeaders(req) {
  const origin = req.headers.origin;
  let allow = '*';
  if (ALLOWED_ORIGINS.length) {
    allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag, X-Sentinel-Cache',
    ...(ALLOWED_ORIGINS.length ? { Vary: 'Origin' } : {}),
  };
}

function send(req, res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json', ...extraHeaders };
  let payload = json;
  if (json.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    payload = gzipSync(json);
    headers['Content-Encoding'] = 'gzip';
  }
  headers.Vary = headers.Vary ? `${headers.Vary}, Accept-Encoding` : 'Accept-Encoding';
  res.writeHead(status, headers);
  res.end(payload);
  return payload.length;
}

function clientKey(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

async function handleAlerts(req, res) {
  const started = Date.now();
  counters.requests += 1;

  if (!limiter.allow(clientKey(req))) {
    counters.rateLimited += 1;
    log('WARNING', 'rate_limited');
    send(req, res, 429, { error: 'Too many requests — please slow down.' }, { 'Retry-After': '60', 'Cache-Control': 'no-store' });
    return;
  }

  let result;
  try {
    result = await cache.get();
  } catch {
    send(req, res, 502, { error: 'NWS alert data is temporarily unavailable.' }, { 'Cache-Control': 'no-store' });
    log('ERROR', 'alerts_unavailable', { latencyMs: Date.now() - started });
    return;
  }

  const { snapshot, cacheStatus, ageMs } = result;
  counters[{ hit: 'cacheHits', miss: 'cacheMisses', coalesced: 'cacheCoalesced', stale: 'cacheStale' }[cacheStatus]] += 1;

  const stale = cacheStatus === 'stale';
  // Browsers always revalidate (cheap: a 304 when nothing changed). A shared
  // cache in front of this — Netlify or Cloud CDN, later — may hold a fresh
  // snapshot for whatever is left of its TTL, never a stale one.
  const remaining = Math.max(0, Math.floor((CACHE_TTL_MS - ageMs) / 1000));
  const headers = {
    'Cache-Control': stale ? 'no-store' : `public, max-age=0, s-maxage=${remaining}, must-revalidate`,
    ETag: snapshot.etag,
    'X-Sentinel-Cache': cacheStatus,
  };

  if (!stale && req.headers['if-none-match'] === snapshot.etag) {
    counters.notModified += 1;
    res.writeHead(304, { ...corsHeaders(req), ...headers });
    res.end();
    log('INFO', 'alerts', { status: 304, cacheStatus, ageMs, latencyMs: Date.now() - started });
    return;
  }

  const responseBytes = send(req, res, 200, snapshot.body, headers);
  log(stale ? 'WARNING' : 'INFO', 'alerts', {
    status: 200,
    cacheStatus,
    ageMs,
    alerts: snapshot.body.counts.alerts,
    supplemental: snapshot.body.counts.supplemental,
    responseBytes,
    latencyMs: Date.now() - started,
  });
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    send(req, res, 405, { error: 'Method not allowed' });
    return;
  }

  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  if (pathname === '/v1/alerts') {
    await handleAlerts(req, res);
    return;
  }
  if (pathname === '/health') {
    send(req, res, 200, {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      revision: REVISION,
      cacheTtlSeconds: CACHE_TTL_MS / 1000,
      snapshotAgeMs: cache.ageMs,
      counters,
    }, { 'Cache-Control': 'no-store' });
    return;
  }
  send(req, res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  log('INFO', 'listening', { port: Number(PORT), cacheTtlMs: CACHE_TTL_MS, maxStaleMs: MAX_STALE_MS });
});
