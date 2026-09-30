/**
 * edgeProxyRoutes.test.js
 * Validates the ROUTES tables of every layer-data proxy edge function.
 *
 * These are plain data, so the failure mode is a silent one: an unrecognised
 * `tier` string falls back to the active tier rather than throwing, which for
 * an evacuation-zone route would quietly stretch a 45-second TTL to three
 * minutes with nothing in the build to show for it. Hence asserting on the
 * tables directly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TIERS } from '../../netlify/edge-functions/_shared/edgeProxy.js';
import { ROUTES as NWS_ROUTES } from '../../netlify/edge-functions/nws-mapservices-proxy.js';
import { ROUTES as ARCGIS_ROUTES } from '../../netlify/edge-functions/arcgis-proxy.js';
import { ROUTES as WX_ROUTES } from '../../netlify/edge-functions/weather-gov-proxy.js';
import { ROUTES as AIRNOW_ROUTES } from '../../netlify/edge-functions/airnow-edge-proxy.js';
import { ROUTES as NESDIS_ROUTES } from '../../netlify/edge-functions/nesdis-proxy.js';
import { ROUTES as NATMAP_ROUTES } from '../../netlify/edge-functions/nationalmap-proxy.js';

const ALL = {
  'nws-mapservices': NWS_ROUTES,
  arcgis: ARCGIS_ROUTES,
  'weather-gov': WX_ROUTES,
  airnow: AIRNOW_ROUTES,
  nesdis: NESDIS_ROUTES,
  nationalmap: NATMAP_ROUTES,
};

const everyRoute = Object.entries(ALL).flatMap(([proxy, routes]) =>
  Object.entries(routes).map(([key, route]) => ({ proxy, key, route })),
);

describe('proxy route tables', () => {
  it('declares a tier that actually exists for every route', () => {
    for (const { proxy, key, route } of everyRoute) {
      expect(
        Object.keys(TIERS),
        `${proxy}/${key} has tier "${route.tier}", which is not a real tier`,
      ).toContain(route.tier);
    }
  });

  it('gives every route an absolute-rooted upstream path', () => {
    for (const { proxy, key, route } of everyRoute) {
      expect(typeof route.path, `${proxy}/${key}`).toBe('string');
      expect(route.path.startsWith('/'), `${proxy}/${key} path must start with /`).toBe(true);
      expect(route.path.endsWith('/'), `${proxy}/${key} path must not end with /`).toBe(false);
    }
  });

  it('uses https for any route-specific origin', () => {
    for (const { proxy, key, route } of everyRoute) {
      if (!route.origin) continue;
      expect(route.origin.startsWith('https://'), `${proxy}/${key}`).toBe(true);
      expect(route.origin.endsWith('/'), `${proxy}/${key} origin must not end with /`).toBe(false);
    }
  });

  it('keeps evacuation zones and NWS alerts on the life-safety tier', () => {
    // These two drive what people physically do, so a future retune must not
    // silently loosen them.
    expect(ARCGIS_ROUTES['ca-evac'].tier).toBe('lifeSafety');
    expect(WX_ROUTES.alerts.tier).toBe('lifeSafety');
  });

  it('only quantizes geometry on routes whose layers fetch per viewport', () => {
    const quantized = everyRoute.filter(({ route }) => route.geometryStep);
    expect(quantized.map(({ key }) => key).sort()).toEqual(
      ['cmra-transmission', 'contours', 'eia-gas', 'monitors', 'structures'],
    );
    // A whole-degree grid is the coarsest we can go before the superset gets
    // wasteful at state level.
    for (const { proxy, key, route } of quantized) {
      expect(route.geometryStep, `${proxy}/${key}`).toBeLessThanOrEqual(1);
      expect(route.geometryStep, `${proxy}/${key}`).toBeGreaterThan(0);
    }
  });

  it('never quantizes a life-safety route, where exact bounds matter', () => {
    for (const { proxy, key, route } of everyRoute) {
      if (route.tier !== 'lifeSafety') continue;
      expect(route.geometryStep, `${proxy}/${key} must not be quantized`).toBeUndefined();
    }
  });

  it('has no duplicate route keys within a proxy', () => {
    for (const [proxy, routes] of Object.entries(ALL)) {
      const keys = Object.keys(routes);
      expect(new Set(keys).size, `${proxy} has duplicate route keys`).toBe(keys.length);
    }
  });
});

describe('netlify.toml edge cache declarations', () => {
  const root = process.cwd();
  const toml = readFileSync(resolve(root, 'netlify.toml'), 'utf8');

  // Minimal [[edge_functions]] block parser — enough for flat key = "value"
  // lines, which is all these blocks contain.
  const blocks = toml
    .split(/^\[\[edge_functions\]\]\s*$/m)
    .slice(1)
    .map((chunk) => {
      const body = chunk.split(/^\[/m)[0];
      return Object.fromEntries(
        [...body.matchAll(/^\s*(\w+)\s*=\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]]),
      );
    });

  const usesCreateProxy = (fn) =>
    readFileSync(resolve(root, `netlify/edge-functions/${fn}.js`), 'utf8').includes('createProxy(');

  it('declares cache = "manual" on every createProxy function', () => {
    // Without it Netlify ignores Netlify-CDN-Cache-Control on edge function
    // responses, so every request runs the function and hits the upstream.
    const proxies = blocks.filter((b) => usesCreateProxy(b.function));
    expect(proxies.map((b) => b.function).sort()).toEqual([
      'airnow-edge-proxy', 'arcgis-proxy', 'nationalmap-proxy',
      'nesdis-proxy', 'nws-mapservices-proxy', 'weather-gov-proxy',
    ]);
    for (const b of proxies) expect(b.cache, `${b.function} must opt into caching`).toBe('manual');
  });

  it('leaves edge functions outside createProxy untouched', () => {
    for (const b of blocks.filter((x) => !usesCreateProxy(x.function))) {
      expect(b.cache, `${b.function} is not a createProxy function`).toBeUndefined();
    }
  });

  it('caps life-safety staleness at ~90 seconds', () => {
    expect(TIERS.lifeSafety.sMaxAge + TIERS.lifeSafety.swr).toBeLessThanOrEqual(90);
  });
});
