// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequestHandler } from '../../supabase/functions/ors-routing/server.mjs';

const BASE = 'https://x.supabase.co/functions/v1/ors-routing';
let handlers, log, handle;

const make = (config = {}) => createRequestHandler({
  handlers,
  log,
  config: { supabaseUrl: 'http://x', supabaseAnonKey: 'k', allowedOrigins: [], maxBodyBytes: 200 * 1024, ...config },
});

const post = (path, body, headers = {}) => new Request(`${BASE}${path}`, { method: 'POST', body, headers });

beforeEach(() => {
  log = vi.fn();
  handlers = {
    nearest: vi.fn().mockResolvedValue({ status: 200, body: { ok: 1 } }),
    route: vi.fn().mockImplementation(async () => { throw new Error('secret value abc'); }),
  };
  handle = make();
});

describe('request handler', () => {
  it('routes below the function name, whatever prefix the runtime keeps', async () => {
    for (const url of [`${BASE}/shelters/nearest`, 'http://localhost/ors-routing/shelters/nearest', 'http://localhost/shelters/nearest']) {
      const r = await handle(new Request(url, { method: 'POST', body: '{"origin":[0,0]}' }));
      expect(r.status).toBe(200);
    }
    expect(handlers.nearest).toHaveBeenCalledTimes(3);
    expect((await handle(new Request(`${BASE}/health`))).status).toBe(200);
    expect((await handle(new Request(`${BASE}/nope`, { method: 'POST', body: '{}' }))).status).toBe(404);
    expect((await handle(new Request(`${BASE}/route`))).status).toBe(404); // GET
  });

  it('passes headers as a lower-case plain object and the parsed body', async () => {
    await handle(post('/shelters/nearest', '{"origin":[1,2]}', { Authorization: 'Bearer t' }));
    const [headers, body] = handlers.nearest.mock.calls[0];
    expect(headers.authorization).toBe('Bearer t');
    expect(body).toEqual({ origin: [1, 2] });
  });

  it('answers the CORS preflight for supabase-js style headers', async () => {
    const r = await handle(new Request(`${BASE}/route`, { method: 'OPTIONS' }));
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.headers.get('access-control-allow-headers')).toMatch(/authorization/);
    expect(r.headers.get('access-control-allow-headers')).toMatch(/apikey/);
  });

  it('echoes an allowed origin, else the first one', async () => {
    const h = make({ allowedOrigins: ['https://a.example', 'https://b.example'] });
    const ok = await h(new Request(`${BASE}/health`, { headers: { Origin: 'https://b.example' } }));
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://b.example');
    const other = await h(new Request(`${BASE}/health`, { headers: { Origin: 'https://evil.example' } }));
    expect(other.headers.get('access-control-allow-origin')).toBe('https://a.example');
  });

  it('503 not_configured without the Supabase URL/key', async () => {
    const r = await make({ supabaseUrl: '' })(post('/route', '{}'));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'not_configured' });
  });

  it('a throwing handler returns 500 and logs kind only', async () => {
    const r = await handle(post('/route', '{}'));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'internal' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('abc');
  });

  it('413 when Content-Length is over the cap, before reading', async () => {
    const big = 'a'.repeat(300 * 1024);
    const r = await handle(post('/route', big, { 'Content-Length': String(big.length) }));
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: 'payload_too_large' });
    expect(handlers.route).not.toHaveBeenCalled();
  });

  it('413 when a streamed body without Content-Length passes the cap', async () => {
    const chunk = new TextEncoder().encode('a'.repeat(100 * 1024));
    let sent = 0;
    const stream = new globalThis.ReadableStream({
      pull(controller) {
        if (sent++ < 3) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const r = await handle(new Request(`${BASE}/route`, { method: 'POST', body: stream, duplex: 'half' }));
    expect(r.status).toBe(413);
    expect(handlers.route).not.toHaveBeenCalled();
  });

  it('bad JSON is a 400 with a detail', async () => {
    const r = await handle(post('/route', '{xx'));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_request', detail: 'body must be JSON' });
  });

  it('sets Retry-After on a 429 and never caches', async () => {
    handlers.nearest.mockResolvedValue({ status: 429, body: { error: 'quota', retryAfterSec: 42 } });
    const r = await handle(post('/shelters/nearest', '{}'));
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('42');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});
