/**
 * airnow-edge-proxy.js
 * Netlify Edge Function — proxies the EPA AirNow ArcGIS feature services
 * behind the "Air Quality Monitors" and "AQI Heatmap" layers.
 *
 * Named -edge-proxy rather than -proxy to stay distinguishable from the
 * pre-existing supabase/functions/airnow-proxy, which is a separate runtime
 * and is left untouched.
 *
 * Both layers are viewport-driven, so `geometryStep` snaps the requested
 * envelope to a 1° grid — without that each viewer's bounds would be its own
 * cache entry and the cache would never be hit.
 */

import { createProxy, TIERS } from './_shared/edgeProxy.js';

const AIRNOW_ORG = '/cJ9YHowT8TU7DUyn/arcgis/rest/services';

export const ROUTES = {
  // AQI heatmap contours
  contours: {
    path: `${AIRNOW_ORG}/AirNowLatestContoursCombined/FeatureServer`,
    tier: 'active',
    geometryStep: 1,
  },
  // Individual sensor stations (PM2.5 / PM10 / ozone)
  monitors: {
    path: `${AIRNOW_ORG}/Air_Now_Monitor_Data_Public/FeatureServer`,
    tier: 'active',
    geometryStep: 1,
  },
};

export default createProxy({
  prefix: '/api/airnow',
  origin: 'https://services.arcgis.com',
  routes: ROUTES,
});

export { TIERS };
