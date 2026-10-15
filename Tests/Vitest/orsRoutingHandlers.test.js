// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHandlers } from '../../cloud/ors-routing/handlers.mjs';
import { TtlCache } from '../../cloud/ors-routing/cache.mjs';
import { FailureLimiter, clientIp } from '../../cloud/ors-routing/limiter.mjs';

const AUTH = { 'x-sentinel-auth': 'Bearer jwt' };
const origin = [-121, 38];
const dest = [-121.2, 38.1];
const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { summary: { distance: 1, duration: 2 } }, geometry: { type: 'LineString', coordinates: [origin, dest] } }] };
const square = { type: 'Polygon', coordinates: [[[-121.1, 38], [-121.05, 38], [-121.05, 38.05], [-121.1, 38]]] };
const orsError = (status) => Object.assign(new Error(`ors ${status}`), { status });

let supabase, ors, shelterSources, h;
beforeEach(() => {
  supabase = {
    getUser: vi.fn().mockResolvedValue({ id: 'u1' }),
    getSubscription: vi.fn().mockResolvedValue({ plan: 'pro', status: 'active' }),
    consumeQuota: vi.fn().mockResolvedValue({ ok: true }),
  };
  ors = {
    matrix: vi.fn().mockResolvedValue({ durations: [[0, 60]], distances: [[0, 900]] }),
    directions: vi.fn().mockResolvedValue(fc),
  };
  shelterSources = {
    sentinel: vi.fn().mockResolvedValue([{ id: 'sentinel:1', source: 'sentinel', name: 'A', kind: 'evacuation_center', address: null, lng: -121.01, lat: 38.01 }]),
    fema: vi.fn().mockResolvedValue([]),
  };
  h = createHandlers({
    supabase, ors, shelterSources,
    nearestCache: new TtlCache({ ttlMs: 600_000 }),
    routeCache: new TtlCache({ ttlMs: 600_000 }),
    log: () => {},
  });
});

describe('nearest', () => {
  it('takes one matrix unit before calling ORS and returns ranked shelters', async () => {
    const r = await h.nearest(AUTH, { origin });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ partial: false, shelters: [expect.objectContaining({ id: 'sentinel:1', durationSec: 60, distanceM: 900 })] });
    expect(supabase.consumeQuota).toHaveBeenCalledWith('jwt', 'matrix');
    expect(supabase.consumeQuota.mock.invocationCallOrder[0]).toBeLessThan(ors.matrix.mock.invocationCallOrder[0]);
  });

  it('flags partial when FEMA fails and still answers', async () => {
    shelterSources.fema.mockRejectedValue(new Error('down'));
    const r = await h.nearest(AUTH, { origin });
    expect(r.status).toBe(200);
    expect(r.body.partial).toBe(true);
  });

  it('returns an empty list without spending quota when nothing is nearby', async () => {
    shelterSources.sentinel.mockResolvedValue([]);
    const r = await h.nearest(AUTH, { origin });
    expect(r.body).toEqual({ shelters: [], partial: false });
    expect(supabase.consumeQuota).not.toHaveBeenCalled();
    expect(ors.matrix).not.toHaveBeenCalled();
  });

  it('serves a cache hit (same ~1 km cell) without quota or ORS, but still authorizes', async () => {
    await h.nearest(AUTH, { origin });
    await h.nearest(AUTH, { origin: [-121.001, 38.001] });
    expect(ors.matrix).toHaveBeenCalledTimes(1);
    expect(supabase.consumeQuota).toHaveBeenCalledTimes(1);
    expect(supabase.getUser).toHaveBeenCalledTimes(2);
  });

  it('clamps radiusKm to 5..160', async () => {
    await h.nearest(AUTH, { origin, radiusKm: 9999 });
    expect(shelterSources.sentinel).toHaveBeenCalledWith(origin, 160);
  });

  it('400 on a bad origin, 401/403 from auth, 429 from quota', async () => {
    expect((await h.nearest(AUTH, { origin: [999, 0] })).status).toBe(400);
    expect((await h.nearest({}, { origin })).status).toBe(401);
    supabase.getSubscription.mockResolvedValue({ plan: 'plus', status: 'active' });
    expect((await h.nearest(AUTH, { origin })).status).toBe(403);
    supabase.getSubscription.mockResolvedValue({ plan: 'pro', status: 'active' });
    supabase.consumeQuota.mockResolvedValue({ ok: false, scope: 'user', window: 'day', retry_after_sec: 100 });
    const r = await h.nearest(AUTH, { origin: [-100, 40] });
    expect(r).toMatchObject({ status: 429, body: { error: 'quota', scope: 'user', window: 'day', retryAfterSec: 100 } });
    expect(ors.matrix).not.toHaveBeenCalled();
  });

  it('maps an upstream ORS 429 to a global quota error', async () => {
    ors.matrix.mockRejectedValue(orsError(429));
    const r = await h.nearest(AUTH, { origin });
    expect(r).toMatchObject({ status: 429, body: { error: 'quota', scope: 'global' } });
  });
});

describe('nearest privacy and logging', () => {
  it('snaps the origin to the ~1 km cell before sources and matrix', async () => {
    await h.nearest(AUTH, { origin: [-121.004, 38.003] });
    expect(shelterSources.sentinel).toHaveBeenCalledWith([-121, 38], 80);
    expect(shelterSources.fema).toHaveBeenCalledWith([-121, 38], 80);
    expect(ors.matrix.mock.calls[0][0][0]).toEqual([-121, 38]);
  });

  it('logs upstream failures by kind/status only, never the message', async () => {
    const log = vi.fn();
    const hh = createHandlers({ supabase, ors, shelterSources, nearestCache: new TtlCache({ ttlMs: 1000 }), routeCache: new TtlCache({ ttlMs: 1000 }), log });
    ors.matrix.mockRejectedValue(new Error('secret value abc'));
    ors.directions.mockRejectedValue(Object.assign(new Error('secret value abc'), { status: 500 }));
    expect((await hh.nearest(AUTH, { origin })).status).toBe(502);
    expect((await hh.route(AUTH, { origin, destination: dest, avoid: null })).status).toBe(502);
    const calls = log.mock.calls;
    expect(calls.some((c) => c[1] === 'upstream_failed' && c[2].path === 'nearest')).toBe(true);
    expect(calls.some((c) => c[1] === 'upstream_failed' && c[2].path === 'route' && c[2].status === 500)).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('abc');
  });

  it('logs why the ORS key could not be read', async () => {
    const log = vi.fn();
    const hh = createHandlers({ supabase, ors, shelterSources, nearestCache: new TtlCache({ ttlMs: 1000 }), routeCache: new TtlCache({ ttlMs: 1000 }), log });
    ors.directions.mockRejectedValue(Object.assign(new Error('ORS secret has the key in a field name'), { name: 'OrsSecretError', reason: 'key_in_name' }));
    expect((await hh.route(AUTH, { origin, destination: dest, avoid: null })).status).toBe(502);
    expect(log.mock.calls.some((c) => c[1] === 'upstream_failed' && c[2].kind === 'OrsSecretError' && c[2].reason === 'key_in_name')).toBe(true);
  });
});

describe('route', () => {
  it('routes with avoid polygons and reports avoidedHazards', async () => {
    const r = await h.route(AUTH, { origin, destination: dest, avoid: square });
    expect(r).toEqual({ status: 200, body: { route: fc, avoidedHazards: true } });
    expect(ors.directions).toHaveBeenCalledWith({ origin, destination: dest, avoid: square });
    expect(supabase.consumeQuota).toHaveBeenCalledWith('jwt', 'directions');
  });

  it('retries once without avoid (taking a second unit) when ORS finds no avoiding route', async () => {
    ors.directions.mockRejectedValueOnce(orsError(404)).mockResolvedValueOnce(fc);
    const r = await h.route(AUTH, { origin, destination: dest, avoid: square });
    expect(r.body.avoidedHazards).toBe(false);
    expect(ors.directions).toHaveBeenNthCalledWith(2, { origin, destination: dest, avoid: null });
    expect(supabase.consumeQuota).toHaveBeenCalledTimes(2);
  });

  it('a refused retry returns no_route without calling ORS again', async () => {
    ors.directions.mockRejectedValueOnce(orsError(404));
    supabase.consumeQuota.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, scope: 'global', window: 'minute', retry_after_sec: 20 });
    const r = await h.route(AUTH, { origin, destination: dest, avoid: square });
    expect(r).toEqual({ status: 422, body: { error: 'no_route' } });
    expect(ors.directions).toHaveBeenCalledTimes(1);
  });

  it('no avoid + no route is a plain no_route', async () => {
    ors.directions.mockRejectedValueOnce(orsError(404));
    const r = await h.route(AUTH, { origin, destination: dest, avoid: null });
    expect(r).toEqual({ status: 422, body: { error: 'no_route' } });
  });

  it('serves an identical request from cache without quota or ORS', async () => {
    await h.route(AUTH, { origin, destination: dest, avoid: square });
    await h.route(AUTH, { origin, destination: dest, avoid: square });
    expect(ors.directions).toHaveBeenCalledTimes(1);
    expect(supabase.consumeQuota).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-polygon avoid and bad coordinates', async () => {
    expect((await h.route(AUTH, { origin, destination: dest, avoid: { type: 'Point', coordinates: [0, 0] } })).status).toBe(400);
    expect((await h.route(AUTH, { origin, destination: [0, 100], avoid: null })).status).toBe(400);
  });

  it('rejects oversized avoid geometry before spending quota', async () => {
    const ring = Array.from({ length: 12_001 }, (_, i) => [-121 + i * 1e-6, 38]);
    const huge = { type: 'Polygon', coordinates: [ring] };
    const r = await h.route(AUTH, { origin, destination: dest, avoid: huge });
    expect(r.status).toBe(400);
    const many = { type: 'MultiPolygon', coordinates: Array.from({ length: 2001 }, () => square.coordinates) };
    expect((await h.route(AUTH, { origin, destination: dest, avoid: many })).status).toBe(400);
    expect(supabase.getUser).not.toHaveBeenCalled();
    expect(supabase.consumeQuota).not.toHaveBeenCalled();
  });

  it('5xx from ORS is a 502', async () => {
    ors.directions.mockRejectedValue(orsError(500));
    expect((await h.route(AUTH, { origin, destination: dest, avoid: null })).status).toBe(502);
  });
});

describe('route time budget (M3)', () => {
  it('skips the no-avoid retry and returns no_route when more than 18 s have elapsed', async () => {
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValue(1_000 + 18_001);
    const hh = createHandlers({ supabase, ors, shelterSources, nearestCache: new TtlCache({ ttlMs: 1000 }), routeCache: new TtlCache({ ttlMs: 1000 }), now });
    ors.directions.mockRejectedValueOnce(orsError(404));
    const r = await hh.route(AUTH, { origin, destination: dest, avoid: square });
    expect(r).toEqual({ status: 422, body: { error: 'no_route' } });
    expect(ors.directions).toHaveBeenCalledTimes(1);
    expect(supabase.consumeQuota).toHaveBeenCalledTimes(1);
  });

  it('still retries when within the budget', async () => {
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValue(1_000 + 17_000);
    const hh = createHandlers({ supabase, ors, shelterSources, nearestCache: new TtlCache({ ttlMs: 1000 }), routeCache: new TtlCache({ ttlMs: 1000 }), now });
    ors.directions.mockRejectedValueOnce(orsError(404)).mockResolvedValueOnce(fc);
    const r = await hh.route(AUTH, { origin, destination: dest, avoid: square });
    expect(r).toEqual({ status: 200, body: { route: fc, avoidedHazards: false } });
    expect(ors.directions).toHaveBeenCalledTimes(2);
  });
});

describe('nearest exact-origin retry (M7)', () => {
  const exact = [-121.004, 38.003];
  const unreachable = { durations: [[0, null]], distances: [[0, null]] };

  it('re-ranks once from the exact origin (one more matrix unit) when the snapped cell reaches nothing', async () => {
    ors.matrix.mockResolvedValueOnce(unreachable).mockResolvedValueOnce({ durations: [[0, 75]], distances: [[0, 1100]] });
    const r = await h.nearest(AUTH, { origin: exact });
    expect(r.status).toBe(200);
    expect(r.body.shelters).toEqual([expect.objectContaining({ id: 'sentinel:1', durationSec: 75 })]);
    expect(ors.matrix).toHaveBeenCalledTimes(2);
    expect(ors.matrix.mock.calls[0][0][0]).toEqual([-121, 38]);
    expect(ors.matrix.mock.calls[1][0][0]).toEqual(exact);
    expect(supabase.consumeQuota).toHaveBeenCalledTimes(2);
    expect(supabase.consumeQuota).toHaveBeenNthCalledWith(2, 'jwt', 'matrix');
    expect(supabase.consumeQuota.mock.invocationCallOrder[1]).toBeLessThan(ors.matrix.mock.invocationCallOrder[1]);
  });

  it('never caches an exact-origin result', async () => {
    ors.matrix.mockResolvedValueOnce(unreachable).mockResolvedValueOnce({ durations: [[0, 75]], distances: [[0, 1100]] })
      .mockResolvedValueOnce(unreachable).mockResolvedValueOnce({ durations: [[0, 80]], distances: [[0, 1200]] });
    await h.nearest(AUTH, { origin: exact });
    const r = await h.nearest(AUTH, { origin: exact });
    expect(r.body.shelters[0].durationSec).toBe(80);
    expect(ors.matrix).toHaveBeenCalledTimes(4);
  });

  it('a refused retry returns the empty list without a second matrix call', async () => {
    ors.matrix.mockResolvedValueOnce(unreachable);
    supabase.consumeQuota.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, scope: 'user', window: 'minute', retry_after_sec: 30 });
    const r = await h.nearest(AUTH, { origin: exact });
    expect(r).toEqual({ status: 200, body: { shelters: [], partial: false } });
    expect(ors.matrix).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the exact origin is already the snapped one', async () => {
    ors.matrix.mockResolvedValueOnce(unreachable);
    const r = await h.nearest(AUTH, { origin });
    expect(r.body.shelters).toEqual([]);
    expect(ors.matrix).toHaveBeenCalledTimes(1);
    expect(supabase.consumeQuota).toHaveBeenCalledTimes(1);
  });
});

describe('FailureLimiter', () => {
  it('blocks an IP after max failures within the window, then forgets', () => {
    let t = 0;
    const lim = new FailureLimiter({ max: 3, windowMs: 1000, now: () => t });
    for (let i = 0; i < 3; i += 1) lim.record('1.1.1.1');
    expect(lim.blocked('1.1.1.1')).toBe(true);
    expect(lim.blocked('2.2.2.2')).toBe(false);
    t = 1001;
    expect(lim.blocked('1.1.1.1')).toBe(false);
  });
  it('bounds memory', () => {
    const lim = new FailureLimiter({ max: 1, windowMs: 1000, maxKeys: 2, now: () => 0 });
    lim.record('a'); lim.record('b'); lim.record('c');
    expect(lim.blocked('a')).toBe(false);
    expect(lim.blocked('c')).toBe(true);
  });
});

describe('clientIp', () => {
  it('reads CloudFront-Viewer-Address (IPv4 and IPv6), ignoring X-Forwarded-For', () => {
    expect(clientIp({ 'cloudfront-viewer-address': '203.0.113.9:51234', 'x-forwarded-for': '6.6.6.6' }, 'x')).toBe('203.0.113.9');
    expect(clientIp({ 'cloudfront-viewer-address': '2001:db8::1:443' }, 'x')).toBe('2001:db8::1');
    expect(clientIp({ 'x-forwarded-for': '6.6.6.6' }, '10.0.0.1')).toBe('10.0.0.1');
  });
});
