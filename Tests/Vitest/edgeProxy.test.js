/**
 * edgeProxy.test.js
 * Unit tests for the shared layer-data edge proxy
 * (netlify/edge-functions/_shared/edgeProxy.js).
 *
 * The CDN cache itself can't be exercised here — `netlify dev` doesn't
 * emulate it either, so caching behaviour is verified against a deploy
 * preview via the Cache-Status header. What's testable locally is everything
 * that decides *what* gets cached and *what* gets sent upstream: the tier
 * table, the param allowlist, envelope quantization and the error paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TIERS,
  ALLOWED_PARAMS,
  quantizeGeometry,
  buildUpstreamUrl,
  cacheHeaders,
  errorResponse,
  resolveRoute,
  createProxy,
} from '../../netlify/edge-functions/_shared/edgeProxy.js';

const ROUTES = {
  outlooks: { path: '/svc/outlooks/MapServer', tier: 'outlook' },
  evac: { path: '/svc/evac/FeatureServer', tier: 'lifeSafety' },
  infra: { path: '/svc/infra/FeatureServer', tier: 'static', geometryStep: 1 },
  elsewhere: { origin: 'https://other.example', path: '/svc/x/MapServer', tier: 'active' },
};

const ORIGIN = 'https://upstream.example';

function makeProxy() {
  return createProxy({ prefix: '/api/test', origin: ORIGIN, routes: ROUTES });
}

function get(path) {
  return new Request(`https://app.test${path}`);
}

describe('cache tiers', () => {
  it('orders tiers from tightest to loosest', () => {
    expect(TIERS.lifeSafety.sMaxAge).toBeLessThan(TIERS.active.sMaxAge);
    expect(TIERS.active.sMaxAge).toBeLessThan(TIERS.outlook.sMaxAge);
    expect(TIERS.outlook.sMaxAge).toBeLessThan(TIERS.static.sMaxAge);
  });

  it('always pairs a stale-while-revalidate window with the TTL', () => {
    // Without SWR a cache expiry makes someone wait on the upstream, which
    // is the latency this whole proxy exists to remove.
    for (const [name, tier] of Object.entries(TIERS)) {
      expect(tier.swr, `${name} must define an SWR window`).toBeGreaterThan(0);
      expect(tier.swr, `${name} SWR should outlast its TTL`).toBeGreaterThanOrEqual(tier.sMaxAge);
    }
  });

  it('keeps life-safety data on a sub-minute TTL', () => {
    expect(TIERS.lifeSafety.sMaxAge).toBeLessThanOrEqual(60);
  });
});

describe('cacheHeaders', () => {
  it('emits the tier TTL on the Netlify-specific CDN header', () => {
    const h = cacheHeaders('outlook', 'wpc-qpf');
    expect(h['Netlify-CDN-Cache-Control']).toBe(
      `public, s-maxage=${TIERS.outlook.sMaxAge}, stale-while-revalidate=${TIERS.outlook.swr}`,
    );
  });

  it('tells the browser to revalidate so no tab outlives the edge copy', () => {
    const h = cacheHeaders('lifeSafety', 'ca-evac');
    expect(h['Cache-Control']).toBe('public, max-age=0, must-revalidate');
  });

  it('tags each response with its layer so it can be purged alone later', () => {
    expect(cacheHeaders('active', 'lsr')['Netlify-Cache-Tag']).toBe('layer:lsr');
  });

  it('varies the cache key only on allowlisted params', () => {
    const vary = cacheHeaders('active', 'lsr')['Netlify-Vary'];
    expect(vary.startsWith('query=')).toBe(true);
    // Tracking params must not appear, or each visitor gets a private entry.
    expect(vary).not.toContain('utm_');
    expect(vary).not.toContain('fbclid');
    expect(vary).toContain('where');
  });

  it('falls back to the active tier for an unrecognised tier name', () => {
    expect(cacheHeaders('nonsense', 'x')['Netlify-CDN-Cache-Control']).toContain(
      `s-maxage=${TIERS.active.sMaxAge}`,
    );
  });

  it('never advertises durable, which edge functions do not support', () => {
    for (const tier of Object.keys(TIERS)) {
      expect(cacheHeaders(tier, 'x')['Netlify-CDN-Cache-Control']).not.toContain('durable');
    }
  });
});

describe('quantizeGeometry', () => {
  it('snaps an envelope outward to the grid so neighbours share a cache entry', () => {
    const raw = JSON.stringify({
      xmin: -122.4194, ymin: 37.7749, xmax: -121.8863, ymax: 38.1234,
      spatialReference: { wkid: 4326 },
    });
    const out = JSON.parse(quantizeGeometry(raw, 1));
    expect(out.xmin).toBe(-123);
    expect(out.ymin).toBe(37);
    expect(out.xmax).toBe(-121);
    expect(out.ymax).toBe(39);
  });

  it('always produces a superset of the requested bounds', () => {
    const box = { xmin: -100.2, ymin: 40.1, xmax: -99.8, ymax: 40.9 };
    const out = JSON.parse(quantizeGeometry(JSON.stringify(box), 1));
    expect(out.xmin).toBeLessThanOrEqual(box.xmin);
    expect(out.ymin).toBeLessThanOrEqual(box.ymin);
    expect(out.xmax).toBeGreaterThanOrEqual(box.xmax);
    expect(out.ymax).toBeGreaterThanOrEqual(box.ymax);
  });

  it('preserves the spatial reference', () => {
    const raw = JSON.stringify({
      xmin: 0, ymin: 0, xmax: 1, ymax: 1, spatialReference: { wkid: 4326 },
    });
    expect(JSON.parse(quantizeGeometry(raw, 1)).spatialReference).toEqual({ wkid: 4326 });
  });

  it('passes the value through untouched when no step is configured', () => {
    const raw = JSON.stringify({ xmin: -122.4194, ymin: 37.7, xmax: -121.8, ymax: 38.1 });
    expect(quantizeGeometry(raw, undefined)).toBe(raw);
  });

  it('degrades to a passthrough rather than corrupting an unparseable value', () => {
    // A poor cache hit rate is acceptable; a mangled upstream query is not.
    expect(quantizeGeometry('-122,37,-121,38', 1)).toBe('-122,37,-121,38');
    expect(quantizeGeometry('{not json', 1)).toBe('{not json');
    expect(quantizeGeometry(JSON.stringify({ rings: [] }), 1)).toBe(JSON.stringify({ rings: [] }));
  });

  it('ignores a non-finite envelope', () => {
    const raw = JSON.stringify({ xmin: null, ymin: 0, xmax: 1, ymax: 1 });
    expect(quantizeGeometry(raw, 1)).toBe(raw);
  });
});

describe('buildUpstreamUrl', () => {
  const search = (qs) => new URLSearchParams(qs);

  it('appends the caller path suffix to the route base', () => {
    const url = buildUpstreamUrl(ROUTES.outlooks, ORIGIN, '/1/query', search('f=geojson'));
    expect(url).toBe(`${ORIGIN}/svc/outlooks/MapServer/1/query?f=geojson`);
  });

  it('prefers a route-specific origin over the proxy default', () => {
    const url = buildUpstreamUrl(ROUTES.elsewhere, ORIGIN, '/0/query', search(''));
    expect(url.startsWith('https://other.example')).toBe(true);
  });

  it('drops params that are not on the allowlist', () => {
    const url = buildUpstreamUrl(
      ROUTES.outlooks, ORIGIN, '/1/query',
      search('where=1%3D1&utm_source=x&fbclid=y&token=secret'),
    );
    expect(url).toContain('where=1');
    expect(url).not.toContain('utm_source');
    expect(url).not.toContain('fbclid');
    // `token` is withheld deliberately — a caller must not be able to attach
    // credentials to an upstream request through this proxy.
    expect(url).not.toContain('token');
  });

  it('keeps commas literal because some NWS endpoints reject %2C', () => {
    const url = buildUpstreamUrl(
      ROUTES.outlooks, ORIGIN, '/query', search('message_type=alert,update'),
    );
    expect(url).toContain('message_type=alert,update');
    expect(url).not.toContain('%2C');
  });

  it('forwards the point param, without which a single-location alert query would widen to the whole country', () => {
    const url = buildUpstreamUrl(ROUTES.outlooks, ORIGIN, '/alerts/active', search('point=37.7,-122.4'));
    expect(url).toContain('point=37.7,-122.4');
  });

  it('forwards the pagination cursor', () => {
    const url = buildUpstreamUrl(ROUTES.outlooks, ORIGIN, '/alerts/active', search('cursor=abc123'));
    expect(url).toContain('cursor=abc123');
  });

  it('quantizes geometry on routes that opt in', () => {
    const geometry = JSON.stringify({ xmin: -122.4, ymin: 37.7, xmax: -122.1, ymax: 37.9 });
    const url = buildUpstreamUrl(
      ROUTES.infra, ORIGIN, '/0/query',
      search(new URLSearchParams({ geometry }).toString()),
    );
    const forwarded = JSON.parse(new URL(url).searchParams.get('geometry'));
    expect(forwarded).toMatchObject({ xmin: -123, ymin: 37, xmax: -122, ymax: 38 });
  });

  it('leaves geometry alone on routes without a step', () => {
    const geometry = JSON.stringify({ xmin: -122.4, ymin: 37.7, xmax: -122.1, ymax: 37.9 });
    const url = buildUpstreamUrl(
      ROUTES.outlooks, ORIGIN, '/0/query',
      search(new URLSearchParams({ geometry }).toString()),
    );
    expect(JSON.parse(new URL(url).searchParams.get('geometry'))).toMatchObject({ xmin: -122.4 });
  });

  it('omits the question mark when there are no params to forward', () => {
    expect(buildUpstreamUrl(ROUTES.outlooks, ORIGIN, '/0', search('utm_source=x'))).not.toContain('?');
  });

  it('lets forcedParams override a caller value', () => {
    const route = { ...ROUTES.outlooks, forcedParams: { f: 'geojson' } };
    const url = buildUpstreamUrl(route, ORIGIN, '/0/query', search('f=html'));
    expect(url).toContain('f=geojson');
    expect(url).not.toContain('f=html');
  });
});

describe('resolveRoute', () => {
  it('splits the first path segment into a route key and keeps the rest as the suffix', () => {
    expect(resolveRoute('/api/test/outlooks/1/query', '/api/test', ROUTES)).toMatchObject({
      routeKey: 'outlooks',
      suffix: '/1/query',
    });
  });

  it('handles a bare route key with no suffix', () => {
    expect(resolveRoute('/api/test/outlooks', '/api/test', ROUTES)).toMatchObject({
      routeKey: 'outlooks',
      suffix: '',
    });
  });

  it('returns null for an unknown key or an empty path', () => {
    expect(resolveRoute('/api/test/nope/1/query', '/api/test', ROUTES)).toBeNull();
    expect(resolveRoute('/api/test', '/api/test', ROUTES)).toBeNull();
    expect(resolveRoute('/api/test/', '/api/test', ROUTES)).toBeNull();
  });
});

describe('errorResponse', () => {
  it('refuses to cache failures so one bad moment is not served for a whole TTL', async () => {
    const res = errorResponse('upstream exploded');
    expect(res.status).toBe(502);
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBe('no-store');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'upstream exploded' });
  });
});

describe('createProxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockUpstream(body, init = {}) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'application/geo+json' }, ...init }),
    );
  }

  it('answers a CORS preflight without calling upstream', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await makeProxy()(new Request('https://app.test/api/test/outlooks', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects non-GET, since the CDN only caches GET', async () => {
    const res = await makeProxy()(new Request('https://app.test/api/test/outlooks', { method: 'POST' }));
    expect(res.status).toBe(405);
  });

  it('404s an unknown route instead of proxying it', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await makeProxy()(get('/api/test/mystery/0/query'));
    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it("proxies a known route and attaches that route's tier headers", async () => {
    mockUpstream(JSON.stringify({ type: 'FeatureCollection', features: [] }));
    const res = await makeProxy()(get('/api/test/evac/0/query?where=1%3D1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toContain(
      `s-maxage=${TIERS.lifeSafety.sMaxAge}`,
    );
    expect(res.headers.get('Netlify-Cache-Tag')).toBe('layer:evac');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('sends the upstream a browser-like User-Agent, which some WAFs require', async () => {
    const spy = mockUpstream('{}');
    await makeProxy()(get('/api/test/outlooks/1/query'));
    expect(spy.mock.calls[0][1].headers['User-Agent']).toContain('SentinelWildfireTracker');
  });

  it('never lets the caller choose the upstream host', async () => {
    const spy = mockUpstream('{}');
    await makeProxy()(get('/api/test/outlooks/1/query?geometry=x'));
    expect(spy.mock.calls[0][0].startsWith(ORIGIN)).toBe(true);
  });

  it('turns an upstream error status into an uncached 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    const res = await makeProxy()(get('/api/test/outlooks/1/query'));
    expect(res.status).toBe(502);
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBe('no-store');
  });

  it('turns a network failure into an uncached 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    const res = await makeProxy()(get('/api/test/outlooks/1/query'));
    expect(res.status).toBe(502);
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toBe('no-store');
    expect((await res.json()).error).toContain('ECONNRESET');
  });
});

describe('allowlist', () => {
  it('covers both the ArcGIS and OGC dialects the layers actually speak', () => {
    for (const p of ['where', 'outFields', 'f', 'resultRecordCount', 'geometry', 'geometryType']) {
      expect(ALLOWED_PARAMS).toContain(p);
    }
    for (const p of ['limit', 'offset', 'bbox', 'datetime']) {
      expect(ALLOWED_PARAMS).toContain(p);
    }
  });

  it('excludes token so credentials cannot be smuggled upstream', () => {
    expect(ALLOWED_PARAMS).not.toContain('token');
  });

  it('has no duplicate entries, which would double up the Vary header', () => {
    expect(new Set(ALLOWED_PARAMS).size).toBe(ALLOWED_PARAMS.length);
  });
});
