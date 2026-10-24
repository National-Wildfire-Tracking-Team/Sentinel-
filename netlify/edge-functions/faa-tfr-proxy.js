/**
 * faa-tfr-proxy.js
 * Netlify Edge Function — proxies the FAA's Temporary Flight Restriction feeds
 * (tfr.faa.gov) behind the TFR layer in the layer panel's Aviation section.
 *
 * tfr.faa.gov sends no CORS headers, so the browser can't call it directly.
 *   shapes – every active TFR's outline as GeoJSON, from the site's own
 *            GeoServer WFS (the same feed its map draws). Circles and arcs
 *            come already turned into polygons.
 *   detail – one NOTAM's XNOTAM XML (times, altitudes, full NOTAM text), by
 *            file name: /api/tfr/detail/detail_6_9169.xml for FDC 6/9169.
 */

import { createProxy } from './_shared/edgeProxy.js';

export const ROUTES = {
  shapes: {
    path: '/geoserver/TFR/ows',
    tier: 'active',
    params: [],
    forcedParams: {
      service: 'WFS',
      version: '1.1.0',
      request: 'GetFeature',
      typeName: 'TFR:V_TFR_LOC',
      maxFeatures: '1000',
      outputFormat: 'application/json',
      srsname: 'EPSG:4326',
    },
  },
  detail: { path: '/download', tier: 'active', params: [], contentType: 'application/xml' },
};

export default createProxy({
  prefix: '/api/tfr',
  origin: 'https://tfr.faa.gov',
  routes: ROUTES,
});
