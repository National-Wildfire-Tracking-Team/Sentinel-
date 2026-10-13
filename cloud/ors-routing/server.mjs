/**
 * server.mjs
 * HTTP request listener for ors-routing, built from injected dependencies so it
 * can be tested without the AWS SDK or the network. index.mjs only wires it up.
 */

import { clientIp } from './limiter.mjs';

export function createRequestListener({ handlers, authFailures, log, config }) {
  const { supabaseUrl, supabaseAnonKey, allowedOrigins = [], maxBodyBytes } = config;

  function corsHeaders(req) {
    const origin = req.headers.origin;
    let allow = '*';
    if (allowedOrigins.length) allow = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    return {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-sentinel-auth, x-amz-content-sha256',
      'Access-Control-Max-Age': '600',
      ...(allowedOrigins.length ? { Vary: 'Origin' } : {}),
    };
  }

  function send(req, res, status, body, extra = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store',
      ...extra,
    });
    res.end(payload);
  }

  const tooLarge = () => Object.assign(new Error('too large'), { status: 413 });

  function readJson(req) {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBodyBytes) {
        reject(tooLarge());
        return;
      }
      let size = 0;
      let overflow = false;
      const chunks = [];
      req.on('data', (c) => {
        if (overflow) return;
        size += c.length;
        if (size > maxBodyBytes) {
          overflow = true;
          chunks.length = 0;
          reject(tooLarge());
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (overflow) return;
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          reject(Object.assign(new Error('bad json'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      send(req, res, 400, { error: 'invalid_request' });
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      send(req, res, 200, { ok: true });
      return;
    }
    const handler = req.method === 'POST' && (
      url.pathname === '/shelters/nearest' ? handlers.nearest
        : url.pathname === '/route' ? handlers.route
          : null
    );
    if (!handler) {
      send(req, res, 404, { error: 'Not found' });
      return;
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      send(req, res, 503, { error: 'not_configured' });
      return;
    }
    const ip = clientIp(req.headers, req.socket.remoteAddress || 'unknown');
    if (authFailures.blocked(ip)) {
      log('WARNING', 'auth_failures_blocked', { path: url.pathname });
      send(req, res, 429, { error: 'too_many_failures', retryAfterSec: 600 }, { 'Retry-After': '600' });
      return;
    }
    let body;
    try {
      body = await readJson(req);
    } catch (err) {
      if (err.status === 413) {
        // Deliver the 413, then drop the connection so the client stops uploading.
        res.on('finish', () => req.destroy());
        send(req, res, 413, { error: 'payload_too_large' }, { Connection: 'close' });
      } else {
        send(req, res, 400, { error: 'invalid_request', detail: 'body must be JSON' });
      }
      return;
    }
    const started = Date.now();
    const { status, body: out } = await handler(req.headers, body);
    if (status === 401 || status === 403) authFailures.record(ip);
    log('INFO', 'request', { path: url.pathname, status, error: out?.error, ms: Date.now() - started });
    const extra = status === 429 && out?.retryAfterSec ? { 'Retry-After': String(out.retryAfterSec) } : {};
    send(req, res, status, out, extra);
  }

  return async function listener(req, res) {
    try {
      await handle(req, res);
    } catch (err) {
      // Kind only: never the message, headers or upstream bodies.
      log('ERROR', 'unhandled', { kind: err?.name });
      if (!res.headersSent) send(req, res, 500, { error: 'internal' });
      else res.destroy();
    }
  };
}
