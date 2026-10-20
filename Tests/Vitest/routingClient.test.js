// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/shared/api/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}));

const { RoutingError, findNearestShelters, requestRoute } = await import('../../src/app/utils/routingClient.js');

const ok = (body) => new Response(JSON.stringify(body), { status: 200 });
const err = (status, body) => new Response(JSON.stringify(body), { status });

describe('routingClient', () => {
  it('posts JSON to the Edge Function with the session token and anon key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ shelters: [], partial: false }));
    await findNearestShelters({ origin: [-121, 38] }, {
      fetchImpl, baseUrl: 'https://x.supabase.co/functions/v1/ors-routing/', anonKey: 'anon',
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://x.supabase.co/functions/v1/ors-routing/shelters/nearest');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers.apikey).toBe('anon');
    expect(init.headers['x-sentinel-auth']).toBeUndefined();
    expect(init.headers['x-amz-content-sha256']).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ origin: [-121, 38], radiusKm: 80 });
  });

  it.each([
    [401, { error: 'unauthenticated' }, 'unauthenticated'],
    [403, { error: 'not_entitled' }, 'not_entitled'],
    [422, { error: 'no_route' }, 'no_route'],
    [400, { error: 'invalid_request' }, 'invalid'],
    [502, { error: 'routing_upstream_failed' }, 'upstream'],
  ])('maps %i to %s', async (status, body, kind) => {
    const fetchImpl = vi.fn().mockResolvedValue(err(status, body));
    const e = await requestRoute({ origin: [0, 0], destination: [1, 1], avoid: null }, { fetchImpl, baseUrl: 'https://x' }).catch((x) => x);
    expect(e).toBeInstanceOf(RoutingError);
    expect(e.kind).toBe(kind);
  });

  it('carries quota scope/window/retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(err(429, { error: 'quota', scope: 'user', window: 'day', retryAfterSec: 99 }));
    const e = await requestRoute({ origin: [0, 0], destination: [1, 1], avoid: null }, { fetchImpl, baseUrl: 'https://x' }).catch((x) => x);
    expect(e).toMatchObject({ kind: 'quota', scope: 'user', window: 'day', retryAfterSec: 99 });
  });

  it('no base URL → not_configured; no session → unauthenticated (no fetch)', async () => {
    const fetchImpl = vi.fn();
    await expect(findNearestShelters({ origin: [0, 0] }, { fetchImpl, baseUrl: '' })).rejects.toMatchObject({ kind: 'not_configured' });
    await expect(findNearestShelters({ origin: [0, 0] }, { fetchImpl, baseUrl: 'https://x', getToken: async () => null })).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes the abort signal through', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ route: {}, avoidedHazards: true }));
    const ac = new AbortController();
    await requestRoute({ origin: [0, 0], destination: [1, 1], avoid: null }, { fetchImpl, baseUrl: 'https://x', signal: ac.signal });
    expect(fetchImpl.mock.calls[0][1].signal).toBe(ac.signal);
  });

  it('defaults to the project\'s ors-routing Edge Function', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co/');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-default');
    vi.resetModules();
    try {
      const client = await import('../../src/app/utils/routingClient.js');
      const fetchImpl = vi.fn().mockResolvedValue(ok({ route: {}, avoidedHazards: false }));
      await client.requestRoute({ origin: [0, 0], destination: [1, 1] }, { fetchImpl });
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://proj.supabase.co/functions/v1/ors-routing/route');
      expect(init.headers.apikey).toBe('anon-default');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
