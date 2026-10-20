/**
 * server.mjs
 * Request → Response handler for ors-routing, built from injected dependencies
 * so it can be tested without Deno or the network. index.ts only wires it up.
 */

// Supabase routes /functions/v1/ors-routing/<path> here; strip everything up
// to the function name so routing sees /route, /shelters/nearest, /health.
const FUNCTION_PREFIX = /^.*?\/ors-routing(?=\/|$)/;

export function createRequestHandler({ handlers, log, config }) {
  const { supabaseUrl, supabaseAnonKey, allowedOrigins = [], maxBodyBytes } = config;

  function corsHeaders(req) {
    const origin = req.headers.get('origin');
    let allow = '*';
    if (allowedOrigins.length) allow = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    return {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Max-Age': '600',
      ...(allowedOrigins.length ? { Vary: 'Origin' } : {}),
    };
  }

  function send(req, status, body, extra = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
    });
  }

  const tooLarge = () => Object.assign(new Error('too large'), { status: 413 });

  /** Reads at most maxBodyBytes: an oversized (or chunked) body is cut off, never buffered whole. */
  async function readJson(req) {
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBodyBytes) throw tooLarge();
    const chunks = [];
    let size = 0;
    if (req.body) {
      const reader = req.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBodyBytes) {
          await reader.cancel();
          throw tooLarge();
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes) || '{}');
    } catch {
      throw Object.assign(new Error('bad json'), { status: 400 });
    }
  }

  async function handle(req) {
    const path = new URL(req.url).pathname.replace(FUNCTION_PREFIX, '') || '/';
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    if (req.method === 'GET' && path === '/health') {
      return send(req, 200, { ok: true });
    }
    const handler = req.method === 'POST' && (
      path === '/shelters/nearest' ? handlers.nearest
        : path === '/route' ? handlers.route
          : null
    );
    if (!handler) {
      return send(req, 404, { error: 'Not found' });
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return send(req, 503, { error: 'not_configured' });
    }
    let body;
    try {
      body = await readJson(req);
    } catch (err) {
      if (err.status === 413) return send(req, 413, { error: 'payload_too_large' });
      return send(req, 400, { error: 'invalid_request', detail: 'body must be JSON' });
    }
    const started = Date.now();
    // Plain object with lower-case names, as the handlers expect.
    const { status, body: out } = await handler(Object.fromEntries(req.headers), body);
    log('INFO', 'request', { path, status, error: out?.error, ms: Date.now() - started });
    const extra = status === 429 && out?.retryAfterSec ? { 'Retry-After': String(out.retryAfterSec) } : {};
    return send(req, status, out, extra);
  }

  return async function handleRequest(req) {
    try {
      return await handle(req);
    } catch (err) {
      // Kind only: never the message, headers or upstream bodies.
      log('ERROR', 'unhandled', { kind: err?.name });
      return send(req, 500, { error: 'internal' });
    }
  };
}
