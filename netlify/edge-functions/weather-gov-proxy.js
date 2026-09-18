/**
 * weather-gov-proxy.js
 * Netlify Edge Function — proxies api.weather.gov for the NWS active-alerts
 * layer and the zone-geometry lookups it depends on.
 *
 * Active alerts sit in the life-safety tier: a new warning has to reach the
 * map quickly, so this is the shortest TTL we hold anywhere. Zone geometry is
 * effectively fixed reference data — src/app/api/noaaWeather.js already backs
 * off failed zone fetches for a day — so it takes the static tier and stops
 * being re-fetched per visitor.
 */

import { createProxy, TIERS } from './_shared/edgeProxy.js';

export const ROUTES = {
  alerts: { path: '/alerts', tier: 'lifeSafety' },
  zones: { path: '/zones', tier: 'static' },
};

export default createProxy({
  prefix: '/api/wx',
  origin: 'https://api.weather.gov',
  routes: ROUTES,
});

export { TIERS };
