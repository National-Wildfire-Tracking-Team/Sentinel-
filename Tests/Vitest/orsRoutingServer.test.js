// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { createRequestListener } from '../../cloud/ors-routing/server.mjs';
import { FailureLimiter } from '../../cloud/ors-routing/limiter.mjs';

let server, port, handlers, log;

function raw(text) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    sock.on('data', (c) => { data += c; });
    sock.on('close', () => resolve(data));
    sock.on('error', () => resolve(data)); // a reset after the response was delivered is fine
    sock.write(text);
    setTimeout(() => sock.end(), 300);
  });
}
const status = (r) => Number(/^HTTP\/1\.1 (\d{3})/.exec(r)?.[1] ?? 0);
const bodyOf = (r) => r.split('\r\n\r\n').slice(1).join('\r\n\r\n');

beforeAll(async () => {
  log = vi.fn();
  handlers = {
    nearest: vi.fn().mockResolvedValue({ status: 200, body: { ok: 1 } }),
    route: vi.fn().mockImplementation(async () => { throw new Error('secret value abc'); }),
  };
  const listener = createRequestListener({
    handlers,
    authFailures: new FailureLimiter(),
    log,
    config: { supabaseUrl: 'http://x', supabaseAnonKey: 'k', allowedOrigins: [], maxBodyBytes: 200 * 1024 },
  });
  server = http.createServer(listener);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
afterAll(() => new Promise((r) => server.close(r)));

describe('request listener', () => {
  it('answers a malformed target with 400 and stays alive', async () => {
    const r = await raw('GET //x:99999 HTTP/1.1\r\nHost: a\r\nConnection: close\r\n\r\n');
    expect(status(r)).toBe(400);
    const h = await raw('GET /health HTTP/1.1\r\nHost: a\r\nConnection: close\r\n\r\n');
    expect(status(h)).toBe(200);
  });

  it('a throwing handler returns 500, logs kind only, and stays alive', async () => {
    const r = await raw('POST /route HTTP/1.1\r\nHost: a\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}');
    expect(status(r)).toBe(500);
    expect(bodyOf(r)).toContain('internal');
    expect(JSON.stringify(log.mock.calls)).not.toContain('abc');
    const h = await raw('GET /health HTTP/1.1\r\nHost: a\r\nConnection: close\r\n\r\n');
    expect(status(h)).toBe(200);
  });

  it('413 with Content-Length over the cap, delivered', async () => {
    const big = 'a'.repeat(300 * 1024);
    const r = await raw(`POST /route HTTP/1.1\r\nHost: a\r\nContent-Length: ${big.length}\r\nConnection: close\r\n\r\n${big}`);
    expect(status(r)).toBe(413);
    expect(bodyOf(r)).toBe('{"error":"payload_too_large"}');
  });

  it('413 with chunked encoding over the cap, delivered', async () => {
    const chunk = 'a'.repeat(100 * 1024);
    const piece = `${chunk.length.toString(16)}\r\n${chunk}\r\n`;
    const r = await raw(`POST /route HTTP/1.1\r\nHost: a\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n${piece}${piece}${piece}0\r\n\r\n`);
    expect(status(r)).toBe(413);
    expect(bodyOf(r)).toContain('{"error":"payload_too_large"}');
  });

  it('bad JSON is a 400 with a detail', async () => {
    const r = await raw('POST /route HTTP/1.1\r\nHost: a\r\nContent-Length: 3\r\nConnection: close\r\n\r\n{xx');
    expect(status(r)).toBe(400);
    expect(JSON.parse(bodyOf(r))).toEqual({ error: 'invalid_request', detail: 'body must be JSON' });
  });
});
