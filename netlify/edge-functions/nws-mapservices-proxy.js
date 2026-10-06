/**
 * nws-mapservices-proxy.js
 * Netlify Edge Function — proxies the NOAA/NWS ArcGIS map services that back
 * the SPC, WPC, CPC, LSR, NHC and DAT map layers.
 *
 * These eleven layers all speak the same ArcGIS REST dialect against
 * mapservices.weather.noaa.gov, so they share one function and one
 * ROUTES table rather than eleven near-identical files — the same shape
 * noaa-proxy.js already uses for its three NWS reference maps.
 *
 * A route's `path` is the service base; the caller appends the usual
 * `/{layerId}/query?…`, so each client only had to repoint its existing
 * base constant at `/api/nws/<key>`.
 *
 * These endpoints are also the ones documented in src/app/api/wpcShared.js as
 * occasionally hanging rather than cleanly failing. Serving them from the
 * edge cache means a hang costs one background revalidation instead of a
 * silently empty layer in every open tab.
 */

import { createProxy, TIERS } from './_shared/edgeProxy.js';

const VECTOR = '/vector/rest/services';

export const ROUTES = {
  // Convective + fire weather outlooks (issued a few times daily)
  'spc-outlooks': { path: `${VECTOR}/outlooks/SPC_wx_outlks/MapServer`, tier: 'outlook' },
  'spc-firewx': { path: `${VECTOR}/fire_weather/SPC_firewx/MapServer`, tier: 'outlook' },

  // Mesoscale discussions are short-fuse, so they sit in the active tier
  // even though they live alongside the outlook products upstream.
  'spc-md': { path: `${VECTOR}/outlooks/spc_mesoscale_discussion/MapServer`, tier: 'active' },

  // WPC outlook suite
  'wpc-precip-hazards': { path: `${VECTOR}/hazards/wpc_precip_hazards/MapServer`, tier: 'outlook' },
  'wpc-wssi': { path: `${VECTOR}/outlooks/wpc_wssi/MapServer`, tier: 'outlook' },
  'wpc-qpf': { path: `${VECTOR}/precip/wpc_qpf/MapServer`, tier: 'outlook' },
  'wpc-fronts': { path: `${VECTOR}/outlooks/natl_fcst_wx_chart/MapServer`, tier: 'outlook' },

  // CPC monthly drought outlook — slowest-moving product here, but kept on
  // the outlook tier rather than static so a re-issue still lands promptly.
  'cpc-drought': { path: `${VECTOR}/outlooks/cpc_drought_outlk/FeatureServer`, tier: 'outlook' },

  // Active watches / warnings / advisories polygons. Life-safety tier for the
  // same reason as the api.weather.gov alerts feed — this is the geometry the
  // alerts layer draws from.
  wwa: { path: '/eventdriven/rest/services/WWA/watch_warn_adv/MapServer', tier: 'lifeSafety' },

  // Observations
  lsr: { path: `${VECTOR}/obs/nws_local_storm_reports/MapServer`, tier: 'active' },
  'nhc-tropical': { path: '/tropical/rest/services/tropical/NHC_tropical_weather/MapServer', tier: 'active' },

  // Damage Assessment Toolkit lives on a different host but is the same
  // dialect, so it rides along here instead of getting its own function.
  dat: {
    origin: 'https://services.dat.noaa.gov',
    path: '/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/MapServer',
    tier: 'active',
  },

  // Not ArcGIS: NHC's public ATCF model guidance files ("a-decks", gzipped
  // text) for the spaghetti-model tracks. Same host-allowlisted passthrough;
  // the upstream sends no CORS headers, so browsers need this hop.
  'nhc-atcf': { origin: 'https://ftp.nhc.noaa.gov', path: '/atcf/aid_public', tier: 'active' },
};

export default createProxy({
  prefix: '/api/nws',
  origin: 'https://mapservices.weather.noaa.gov',
  routes: ROUTES,
});

export { TIERS };
