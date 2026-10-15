/**
 * index.mjs
 * hurricane-models — HTTP service (AWS Lambda via the Web Adapter, or any
 * container host).
 *
 * Reads NHC's public ATCF model guidance ("a-decks") once per change for
 * everyone, instead of every browser downloading and parsing a 250 KB+
 * gzipped deck per storm, and serves Sentinel's normalized model tracks.
 *
 * GET /v1/hurricanes                       → active storms (NHC CurrentStorms.json)
 * GET /v1/hurricanes/{stormId}/models      → model tracks for one storm
 *     ?cycle=YYYYMMDDHH                       as of an earlier cycle (historical)
 * GET /health                              → counters, no storm data
 *
 * See README.md for the contract, caching and the model registry.
 */

import { createServer } from 'node:http';
import {
  ActiveStormsCache, RateLimiter, SCHEMA_VERSION, StormStore, createRouter, encodeBody,
} from './service.mjs';

const PORT = process.env.PORT || 8080;

// NHC appends to an a-deck as each model's run arrives, all through the
// cycle, so five minutes keeps new runs prompt; revalidation is a 304 when
// nothing changed.
const CACHE_TTL_MS = Number(process.env.HURRICANE_MODELS_CACHE_TTL_SECONDS || 300) * 1000;
// How long past its TTL the last good deck may be served (flagged stale)
// while NHC is failing. After that the storm returns 502.
const MAX_STALE_MS = Number(process.env.HURRICANE_MODELS_MAX_STALE_SECONDS || 6 * 3600) * 1000;
const ACTIVE_TTL_MS = Number(process.env.HURRICANE_ACTIVE_CACHE_TTL_SECONDS || 120) * 1000;
const MAX_STORMS = Number(process.env.HURRICANE_MODELS_MAX_STORMS || 32);
const RATE_LIMIT_PER_MINUTE = Number(process.env.HURRICANE_MODELS_RATE_LIMIT_PER_MINUTE || 120);
const USER_AGENT = process.env.NOAA_USER_AGENT
  || 'SentinelWildfireTracker/1.0 (+https://app.nationalwildfiretrackingteam.org)';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const REVISION = process.env.K_REVISION || process.env.AWS_LAMBDA_FUNCTION_VERSION || 'local';

function log(severity, message, fields = {}) {
  console.log(JSON.stringify({ severity, message, component: 'hurricane-models', revision: REVISION, ...fields }));
}

const store = new StormStore({ ttlMs: CACHE_TTL_MS, maxStaleMs: MAX_STALE_MS, maxEntries: MAX_STORMS, userAgent: USER_AGENT, log });
const activeStorms = new ActiveStormsCache({ ttlMs: ACTIVE_TTL_MS, maxStaleMs: 3600 * 1000, userAgent: USER_AGENT, log });
const limiter = new RateLimiter({ limit: RATE_LIMIT_PER_MINUTE, windowMs: 60 * 1000 });
const router = createRouter({ store, activeStorms, limiter, log });

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

function clientKey(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }
  let result;
  try {
    result = await router.route({ method: req.method, url: req.url, headers: req.headers, clientKey: clientKey(req) });
  } catch (err) {
    log('ERROR', 'request_failed', { error: String(err?.message || err) });
    result = { status: 500, body: { error: 'Internal error' }, headers: { 'Cache-Control': 'no-store' } };
  }
  const headers = { ...corsHeaders(req), ...result.headers };
  if (result.status === 304) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const payload = result.json ?? JSON.stringify(result.body);
  const { data, encoding } = encodeBody(payload, req.headers['accept-encoding'] || '');
  headers['Content-Type'] = 'application/json';
  if (encoding) headers['Content-Encoding'] = encoding;
  headers.Vary = headers.Vary ? `${headers.Vary}, Accept-Encoding` : 'Accept-Encoding';
  res.writeHead(result.status, headers);
  res.end(data);
  if (req.url !== '/health') {
    log(result.status >= 500 ? 'ERROR' : 'INFO', 'request', {
      status: result.status,
      path: new URL(req.url, 'http://localhost').pathname.slice(0, 80),
      responseBytes: data.length,
      latencyMs: Date.now() - started,
      ...result.logFields,
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log('INFO', 'listening', { port: Number(PORT), schemaVersion: SCHEMA_VERSION, cacheTtlMs: CACHE_TTL_MS, maxStaleMs: MAX_STALE_MS });
});
