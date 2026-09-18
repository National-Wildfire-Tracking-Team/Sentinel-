/**
 * nationalmap-proxy.js
 * Netlify Edge Function — proxies the USGS National Map structures
 * MapServer behind the "Schools & Universities" layer.
 *
 * Static tier: this is fixed reference geometry that changes on a survey
 * cycle, not a live feed. Viewport-driven, so the envelope is snapped to a
 * 1° grid to keep the cache from fragmenting per viewer.
 */

import { createProxy, TIERS } from './_shared/edgeProxy.js';

export const ROUTES = {
  structures: {
    path: '/arcgis/rest/services/structures/MapServer',
    tier: 'static',
    geometryStep: 1,
  },
};

export default createProxy({
  prefix: '/api/natmap',
  origin: 'https://carto.nationalmap.gov',
  routes: ROUTES,
});

export { TIERS };
