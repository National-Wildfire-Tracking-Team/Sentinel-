/**
 * nesdis-proxy.js
 * Netlify Edge Function — proxies the NOAA NESDIS NGFS fire-detection
 * OGC API Features service behind the "GOES Fire Detections" layer.
 *
 * Unlike the ArcGIS routes this is an OGC API, so it takes limit/offset/bbox
 * rather than resultRecordCount/geometry — both dialects are covered by the
 * shared param allowlist. src/app/api/noaaNgfs.js pages through this at 3000
 * features a request, so caching it at the edge removes several sequential
 * upstream round-trips per visitor rather than just one.
 */

import { createProxy, TIERS } from './_shared/edgeProxy.js';

export const ROUTES = {
  collections: { path: '/api/ogc/detections/collections', tier: 'active' },
};

export default createProxy({
  prefix: '/api/nesdis',
  origin: 'https://fire.data.nesdis.noaa.gov',
  routes: ROUTES,
});

export { TIERS };
