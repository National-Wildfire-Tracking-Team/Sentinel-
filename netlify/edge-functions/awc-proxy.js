/**
 * awc-proxy.js
 * Netlify Edge Function — proxies the Aviation Weather Center Data API
 * (aviationweather.gov/api/data, OpenAPI v4.0) behind the Aviation Weather
 * Center layer on the Weather and All Hazards tabs.
 *
 * AWC sends no CORS headers, so the browser can't call it directly. Its rules
 * shape these routes:
 *   - 100 requests per minute, per IP, and every visitor shares the proxy's.
 *     The CDN tiers below are what keeps us under it: one upstream request
 *     per route + query per POP per TTL, however many people are looking.
 *   - At most 400 results per query. The airport-weather dots need every
 *     station, so they come from AWC's own all-stations METAR file
 *     (metar-cache, refreshed once a minute), which the docs recommend for
 *     exactly this; the API answers the per-station METAR/TAF on a click.
 *   - Any query param the spec doesn't document is an error, so each route
 *     lists the params its endpoint takes (`params`) and nothing else is
 *     forwarded.
 *   - 204 with an empty body means "valid request, no data".
 *
 * The deprecated airsigmet and isigmet endpoints aren't routed: /sigmet
 * returns both their sets (U.S. domestic and international) in one.
 */

import { createProxy, TIERS } from './_shared/edgeProxy.js';

const POINT = ['ids', 'bbox', 'format'];

export const ROUTES = {
  // Every current METAR worldwide, gzipped CSV (~260 KB). Unzipped in the browser.
  'metar-cache': { path: '/data/cache/metars.cache.csv.gz', tier: 'active', params: [], contentType: 'application/gzip' },
  metar: { path: '/api/data/metar', tier: 'active', params: [...POINT, 'taf', 'hours', 'date'] },
  taf: { path: '/api/data/taf', tier: 'active', params: [...POINT, 'metar', 'time', 'date'] },
  pirep: { path: '/api/data/pirep', tier: 'active', params: ['id', 'distance', 'bbox', 'format', 'age', 'level', 'inten', 'date'] },
  sigmet: { path: '/api/data/sigmet', tier: 'active', params: ['format', 'hazard', 'level', 'date'] },
  gairmet: { path: '/api/data/gairmet', tier: 'active', params: ['product', 'format', 'hazard', 'date', 'fore'] },
  airmet: { path: '/api/data/airmet', tier: 'active', params: ['format', 'hazard', 'level', 'date'] },
  cwa: { path: '/api/data/cwa', tier: 'active', params: ['hazard', 'format', 'date'] },
  // Issued every other hour.
  tcf: { path: '/api/data/tcf', tier: 'outlook', params: ['format'] },
  // Text products, issued a few times a day.
  windtemp: { path: '/api/data/windtemp', tier: 'outlook', params: ['region', 'level', 'fcst'] },
  areafcst: { path: '/api/data/areafcst', tier: 'outlook', params: ['region'] },
  fcstdisc: { path: '/api/data/fcstdisc', tier: 'outlook', params: ['cwa', 'type'] },
  mis: { path: '/api/data/mis', tier: 'active', params: ['loc', 'format'] },
  // Navigational reference data: changes on the 28-day AIRAC cycle at most.
  stationinfo: { path: '/api/data/stationinfo', tier: 'static', params: POINT },
  airport: { path: '/api/data/airport', tier: 'static', params: POINT },
  navaid: { path: '/api/data/navaid', tier: 'static', params: POINT },
  fix: { path: '/api/data/fix', tier: 'static', params: POINT },
  feature: { path: '/api/data/feature', tier: 'static', params: ['bbox', 'format'] },
  obstacle: { path: '/api/data/obstacle', tier: 'static', params: ['bbox', 'format'] },
};

export default createProxy({
  prefix: '/api/awc',
  origin: 'https://aviationweather.gov',
  routes: ROUTES,
});

export { TIERS };
