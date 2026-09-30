/**
 * index.mjs
 * fema-nfhl-proxy — Google Cloud Run service (HTTP).
 *
 * Fronts FEMA's National Flood Hazard Layer (NFHL) ArcGIS REST service for
 * Sentinel's Flood Hazard map layer (src/app/api/femaFloodHazards.js). The
 * browser never talks to FEMA: it asks this service for the current viewport,
 * and this service answers from a per-tile cache, fetching only the tiles it
 * doesn't already hold. The national dataset is never copied — tiles are
 * fetched on demand and expire, so FEMA's map revisions (LOMRs, new studies)
 * flow through within one TTL without any rebuild.
 *
 * GET /flood-hazards?bbox=<west>,<south>,<east>,<north>&zoom=<mapZoom>
 *   → { level, zones, panels, availability, attribution, truncated, stale?, generatedAt }
 *
 * See nfhl.mjs for the tile grid, zoom levels, classification, and cache.
 * No Firestore, no GCS, no credentials — FEMA's service is public, so there's
 * nothing to authenticate upstream and nothing secret to store.
 */

import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import {
  ATTRIBUTION,
  RateLimiter,
  RequestError,
  TileCache,
  UpstreamError,
  bboxAreaKm2,
  parseQuery,
  resolveFloodHazards,
} from './nfhl.mjs';

const PORT = process.env.PORT || 8080;

const HOUR_MS = 60 * 60 * 1000;
// NFHL revisions are published continuously (LOMRs become effective most
// business days) but any single area changes on the scale of months, so a
// day-old tile is current for practical purposes.
const CACHE_TTL_MS = Number(process.env.NFHL_CACHE_TTL_HOURS || 24) * HOUR_MS;
// Past the TTL, keep entries this long as a fallback while FEMA is down.
const CACHE_STALE_MS = 7 * 24 * HOUR_MS;
const CACHE_MAX_ENTRIES = Number(process.env.NFHL_CACHE_MAX_ENTRIES || 4000);
const CACHE_VERSION = process.env.NFHL_CACHE_VERSION || 'v1';

const RATE_LIMIT_PER_MINUTE = Number(process.env.NFHL_RATE_LIMIT_PER_MINUTE || 120);

// Comma-separated list of allowed browser origins; unset means '*', same as
// Sentinel's other public-data proxies.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const cache = new TileCache({
  ttlMs: CACHE_TTL_MS,
  staleMs: CACHE_STALE_MS,
  maxEntries: CACHE_MAX_ENTRIES,
  version: CACHE_VERSION,
});
const limiter = new RateLimiter({ limit: RATE_LIMIT_PER_MINUTE, windowMs: 60 * 1000 });

// Process-lifetime counters surfaced on /health. Aggregates only.
const counters = {
  requests: 0,
  tileHits: 0,
  tileMisses: 0,
  tileStale: 0,
  upstreamRequests: 0,
  upstreamErrors: 0,
  clientErrors: 0,
  rateLimited: 0,
};

/**
 * Structured log line — Cloud Logging parses `severity` and indexes the rest
 * as jsonPayload, so log-based metrics can be built on any field. Never
 * includes coordinates, IPs, or anything else that locates a user.
 */
function log(severity, message, fields = {}) {
  console.log(JSON.stringify({ severity, message, component: 'fema-nfhl-proxy', ...fields }));
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  let allow = '*';
  if (ALLOWED_ORIGINS.length) {
    allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
    headers.Vary = headers.Vary ? `${headers.Vary}, Accept-Encoding` : 'Accept-Encoding';
  }
  res.writeHead(status, headers);
  res.end(payload);
  return json.length;
}

function clientKey(req) {
  // Cloud Run puts the original client first in X-Forwarded-For.
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

async function handleFloodHazards(req, res, url) {
  const started = Date.now();
  counters.requests += 1;

  if (!limiter.allow(clientKey(req))) {
    counters.rateLimited += 1;
    log('WARNING', 'rate_limited');
    send(req, res, 429, { error: 'Too many requests — please slow down.' }, { 'Retry-After': '60', 'Cache-Control': 'no-store' });
    return;
  }

  let query;
  try {
    query = parseQuery(url.searchParams);
  } catch (err) {
    counters.clientErrors += 1;
    const status = err instanceof RequestError ? err.status : 400;
    log('INFO', 'invalid_request', { status, reason: err.message });
    send(req, res, status, { error: err.message }, { 'Cache-Control': 'no-store' });
    return;
  }

  try {
    const { body, stats } = await resolveFloodHazards(query, { cache });
    counters.tileHits += stats.hits;
    counters.tileMisses += stats.misses;
    counters.tileStale += stats.stale;
    counters.upstreamRequests += stats.upstreamRequests;

    // Browser-cacheable for 15 min; a stale fallback is never cached so the
    // client picks up fresh data as soon as FEMA recovers.
    const cacheControl = body.stale ? 'no-store' : 'public, max-age=900';
    const responseBytes = send(req, res, 200, body, { 'Cache-Control': cacheControl });

    log('INFO', 'flood_hazards', {
      status: 200,
      level: stats.level,
      zoomBucket: Math.floor(query.zoom),
      areaKm2: Math.round(bboxAreaKm2(query.bbox)),
      tiles: stats.tiles,
      cacheHits: stats.hits,
      cacheMisses: stats.misses,
      cacheStale: stats.stale,
      cacheHitRate: stats.tiles ? Number((stats.hits / stats.tiles).toFixed(3)) : null,
      upstreamRequests: stats.upstreamRequests,
      upstreamBytes: stats.upstreamBytes,
      responseBytes,
      features: body.zones.features.length + body.panels.features.length + body.availability.features.length,
      truncated: body.truncated,
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    if (err instanceof RequestError) {
      counters.clientErrors += 1;
      log('INFO', 'invalid_request', { status: err.status, reason: err.message, areaKm2: Math.round(bboxAreaKm2(query.bbox)) });
      send(req, res, err.status, { error: err.message }, { 'Cache-Control': 'no-store' });
      return;
    }
    counters.upstreamErrors += 1;
    // Internal detail stays in the logs; the client gets a generic message.
    log('ERROR', 'upstream_error', {
      error: err instanceof UpstreamError ? err.message : String(err?.message || err),
      latencyMs: Date.now() - started,
    });
    send(req, res, 502, { error: 'Flood hazard data is temporarily unavailable.' }, { 'Cache-Control': 'no-store' });
  }
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

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/flood-hazards') {
    await handleFloodHazards(req, res, url);
    return;
  }
  if (url.pathname === '/health') {
    send(req, res, 200, {
      ok: true,
      attribution: ATTRIBUTION,
      cacheVersion: CACHE_VERSION,
      cacheEntries: cache.size,
      counters,
    }, { 'Cache-Control': 'no-store' });
    return;
  }
  send(req, res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  log('INFO', 'listening', { port: Number(PORT), cacheVersion: CACHE_VERSION, cacheTtlMs: CACHE_TTL_MS });
});
