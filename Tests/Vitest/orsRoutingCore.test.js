// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { isLngLat, haversineM, roundCoord } from '../../supabase/functions/ors-routing/geo.mjs';
import { parseOrsSecret, createKeyLoader } from '../../supabase/functions/ors-routing/secret.mjs';
import { TtlCache } from '../../supabase/functions/ors-routing/cache.mjs';
import { ORS_BASE_URL, createOrs } from '../../supabase/functions/ors-routing/ors.mjs';
import {
  HttpError, authorize, bearerFrom, createSupabase, takeQuota,
} from '../../supabase/functions/ors-routing/auth.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('geo', () => {
  it('validates [lng, lat]', () => {
    expect(isLngLat([-120.5, 38.2])).toBe(true);
    expect(isLngLat([200, 0])).toBe(false);
    expect(isLngLat([0, 95])).toBe(false);
    expect(isLngLat(['1', 2])).toBe(false);
    expect(isLngLat([1])).toBe(false);
    expect(isLngLat(null)).toBe(false);
  });
  it('haversine is ~111 km per degree of latitude', () => {
    expect(haversineM([0, 0], [0, 1])).toBeGreaterThan(110_000);
    expect(haversineM([0, 0], [0, 1])).toBeLessThan(112_000);
  });
  it('rounds coordinates', () => {
    expect(roundCoord(-120.12345, 2)).toBe(-120.12);
  });
});

describe('secret', () => {
  it('accepts a plain string', () => expect(parseOrsSecret('  abc123 ')).toBe('abc123'));
  it.each([
    ['{"ORS_API_KEY":"k1"}', 'k1'],
    ['{"apiKey":"k2"}', 'k2'],
    ['{"api_key":"k3"}', 'k3'],
  ])('accepts JSON %s', (raw, key) => expect(parseOrsSecret(raw)).toBe(key));
  it('rejects empty, bad JSON and JSON without a key', () => {
    expect(() => parseOrsSecret('')).toThrow(/empty/);
    expect(() => parseOrsSecret('{nope')).toThrow(/not valid JSON/);
    expect(() => parseOrsSecret('{"other":"x"}')).toThrow(/ORS_API_KEY/);
  });
  it.each([
    ['', 'empty'],
    ['{nope', 'invalid_json'],
    ['{"other":"x"}', 'missing_field'],
    // Console Key/value with the API key typed into the key box, value left blank.
    ['{"5b3ce3597851110001cf6248abc":""}', 'key_in_name'],
  ])('tags %s as OrsSecretError (%s) without echoing the secret', (raw, reason) => {
    let err;
    try { parseOrsSecret(raw); } catch (e) { err = e; }
    expect(err.name).toBe('OrsSecretError');
    expect(err.reason).toBe(reason);
    expect(err.message).not.toContain('5b3ce');
  });
  it('loads once and retries after a failure', async () => {
    const get = vi.fn()
      .mockRejectedValueOnce(new Error('throttled'))
      .mockResolvedValue('{"apiKey":"k"}');
    const load = createKeyLoader(get);
    await expect(load()).rejects.toThrow('throttled');
    await expect(load()).resolves.toBe('k');
    await expect(load()).resolves.toBe('k');
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('TtlCache', () => {
  it('expires entries and evicts the oldest past maxEntries', () => {
    let t = 0;
    const cache = new TtlCache({ ttlMs: 1000, maxEntries: 2, now: () => t });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    t = 1001;
    expect(cache.get('b')).toBeUndefined();
  });
});

describe('auth', () => {
  const sb = (overrides = {}) => ({
    getUser: vi.fn().mockResolvedValue({ id: 'u1' }),
    getSubscription: vi.fn().mockResolvedValue({ plan: 'pro', status: 'active' }),
    consumeQuota: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  });

  it('reads the bearer token from Authorization', () => {
    expect(bearerFrom({ authorization: 'Bearer abc' })).toBe('abc');
    expect(bearerFrom({ authorization: 'Basic abc' })).toBeNull();
    expect(bearerFrom({ 'x-sentinel-auth': 'Bearer abc' })).toBeNull();
    expect(bearerFrom({})).toBeNull();
  });

  it.each([
    ['pro', 'active'], ['pro', 'trialing'], ['pro', 'past_due'], ['team', 'active'],
  ])('allows %s/%s', async (plan, status) => {
    const s = sb({ getSubscription: vi.fn().mockResolvedValue({ plan, status }) });
    await expect(authorize(s, { authorization: 'Bearer t' })).resolves.toEqual({ jwt: 't', userId: 'u1' });
    expect(s.getSubscription).toHaveBeenCalledWith('t', 'u1');
  });

  it.each([
    [{ plan: 'pro', status: 'canceled' }],
    [{ plan: 'plus', status: 'active' }],
    [{ plan: 'free', status: 'active' }],
    [null],
  ])('403 for %j', async (sub) => {
    const s = sb({ getSubscription: vi.fn().mockResolvedValue(sub) });
    await expect(authorize(s, { authorization: 'Bearer t' })).rejects.toMatchObject({ status: 403 });
  });

  it('401 without a token or with an invalid one', async () => {
    await expect(authorize(sb(), {})).rejects.toMatchObject({ status: 401 });
    const s = sb({ getUser: vi.fn().mockResolvedValue(null) });
    await expect(authorize(s, { authorization: 'Bearer bad' })).rejects.toMatchObject({ status: 401 });
  });

  it('takeQuota maps a refusal to 429 with scope/window/retry', async () => {
    const s = sb({ consumeQuota: vi.fn().mockResolvedValue({ ok: false, scope: 'global', window: 'day', retry_after_sec: 3600 }) });
    const err = await takeQuota(s, 't', 'directions').catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(429);
    expect(err.body).toEqual({ error: 'quota', scope: 'global', window: 'day', retryAfterSec: 3600 });
  });

  it('createSupabase sends the caller JWT and anon key', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ id: 'u1' }))
      .mockResolvedValueOnce(json([{ plan: 'pro', status: 'active' }]))
      .mockResolvedValueOnce(json({ ok: true }));
    const s = createSupabase({ url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl });
    await s.getUser('jwt');
    await s.getSubscription('jwt', 'u1');
    await s.consumeQuota('jwt', 'matrix');
    const [, userInit] = fetchImpl.mock.calls[0];
    expect(fetchImpl.mock.calls[0][0]).toBe('https://x.supabase.co/auth/v1/user');
    expect(userInit.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer jwt' });
    expect(fetchImpl.mock.calls[1][0]).toBe('https://x.supabase.co/rest/v1/subscriptions?select=plan,status&user_id=eq.u1&limit=1');
    expect(fetchImpl.mock.calls[2][0]).toBe('https://x.supabase.co/rest/v1/rpc/consume_routing_quota');
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body)).toEqual({ p_endpoint: 'matrix' });
  });

  it('createSupabase returns null for a rejected JWT, 403 when the RPC refuses the plan, 502 when it fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ msg: 'bad jwt' }, 401))
      .mockResolvedValueOnce(json({ code: '42501' }, 403))
      .mockResolvedValueOnce(json({ message: 'boom' }, 500));
    const s = createSupabase({ url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl });
    await expect(s.getUser('bad')).resolves.toBeNull();
    await expect(s.consumeQuota('jwt', 'directions')).rejects.toMatchObject({ status: 403, body: { error: 'not_entitled' } });
    await expect(s.consumeQuota('jwt', 'directions')).rejects.toMatchObject({ status: 502 });
  });

  it('createSupabase getUser throws 502 auth_unavailable on 5xx/429 instead of returning null', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ message: 'boom' }, 500))
      .mockResolvedValueOnce(json({ message: 'slow down' }, 429))
      .mockResolvedValueOnce(json({ msg: 'forbidden' }, 403));
    const s = createSupabase({ url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl });
    await expect(s.getUser('jwt')).rejects.toMatchObject({ status: 502, body: { error: 'auth_unavailable' } });
    await expect(s.getUser('jwt')).rejects.toMatchObject({ status: 502 });
    await expect(s.getUser('jwt')).resolves.toBeNull();
  });

  it.each([400, 404, 405, 422])('createSupabase getUser returns null (-> 401) for a %i so garbage tokens count as auth failures', async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ msg: 'bad' }, status));
    const s = createSupabase({ url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl });
    await expect(s.getUser('garbage')).resolves.toBeNull();
    await expect(authorize(s, { authorization: 'Bearer garbage' })).rejects.toMatchObject({ status: 401 });
  });

  it.each([429, 500, 503])('createSupabase getUser throws 502 auth_unavailable for a %i', async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, status));
    const s = createSupabase({ url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl });
    await expect(s.getUser('jwt')).rejects.toMatchObject({ status: 502, body: { error: 'auth_unavailable' } });
  });
});

describe('ors', () => {
  const fc = { type: 'FeatureCollection', features: [] };
  const square = { type: 'Polygon', coordinates: [[[-121.1, 38], [-121.05, 38], [-121.05, 38.05], [-121.1, 38]]] };

  it('directions: geojson endpoint, key in Authorization, avoid polygons under options', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(fc));
    const ors = createOrs(async () => 'k', { fetchImpl });
    await expect(ors.directions({ origin: [-121, 38], destination: [-121.2, 38.1], avoid: square, preference: 'fastest' })).resolves.toEqual(fc);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${ORS_BASE_URL}/directions/driving-car/geojson`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'k', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({
      coordinates: [[-121, 38], [-121.2, 38.1]],
      instructions: true,
      preference: 'fastest',
      options: { avoid_polygons: square },
    });
  });

  it('directions: no avoid and no preference sends neither', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(fc));
    await createOrs(async () => 'k', { fetchImpl }).directions({ origin: [0, 0], destination: [1, 1], avoid: null });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ coordinates: [[0, 0], [1, 1]], instructions: true });
  });

  it('matrix: origin as the only source, every other location a destination', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ durations: [[0, 1, 2]] }));
    await createOrs(async () => 'k', { fetchImpl }).matrix([[0, 0], [1, 1], [2, 2]]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${ORS_BASE_URL}/matrix/driving-car`);
    expect(JSON.parse(init.body)).toEqual({
      locations: [[0, 0], [1, 1], [2, 2]],
      sources: [0],
      destinations: [1, 2],
      metrics: ['duration', 'distance'],
    });
  });

  it('a non-2xx throws an error carrying .status and never the key or body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: { code: 2009, message: 'secret-ish detail' } }, 404));
    const err = await createOrs(async () => 'k123', { fetchImpl }).directions({ origin: [0, 0], destination: [1, 1] }).catch((e) => e);
    expect(err).toMatchObject({ name: 'OrsHttpError', status: 404 });
    expect(err.message).not.toContain('k123');
    expect(err.message).not.toContain('secret-ish');
  });

  it('a key that fails to load rejects before any request', async () => {
    const fetchImpl = vi.fn();
    const ors = createOrs(async () => { throw new Error('no key'); }, { fetchImpl });
    await expect(ors.matrix([[0, 0], [1, 1]])).rejects.toThrow('no key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
