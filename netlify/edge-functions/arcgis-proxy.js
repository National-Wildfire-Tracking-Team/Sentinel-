/**
 * arcgis-proxy.js
 * Netlify Edge Function — proxies the Esri-hosted ArcGIS Online feature
 * services behind the evacuation zone, RAWS, smoke forecast and
 * infrastructure layers.
 *
 * Each route pins its own origin because Esri shards these across
 * services / services2 / services3 / services9 per organisation.
 *
 * `geometryStep` is set on the viewport-driven routes. Those layers send the
 * map's exact bounds, which would make every user's request a unique cache
 * key and defeat the cache entirely; snapping the envelope to a 1° grid lets
 * nearby viewers share one entry. See quantizeGeometry in _shared.
 */

import { createProxy, TIERS } from './_shared/edgeProxy.js';

const REST = '/arcgis/rest/services';

export const ROUTES = {
  // Cal OES evacuation zones — life-safety tier: these drive what people do.
  'ca-evac': {
    origin: 'https://services.arcgis.com',
    path: `/BLN4oKB0N1YSgvY8${REST}/CA_EVACUATIONS_CalOESHosted_view/FeatureServer`,
    tier: 'lifeSafety',
  },

  // Fire weather stations — observations refresh through the day.
  raws: {
    origin: 'https://services3.arcgis.com',
    path: `/T4QMspbfLg3qTGWY${REST}/PublicView_RAWS/FeatureServer`,
    tier: 'active',
  },

  // NDGD hourly smoke concentration forecast (48h grid).
  'ndgd-smoke': {
    origin: 'https://services9.arcgis.com',
    path: `/RHVPKKiFTONKtxq3${REST}/NDGD_SmokeForecast_v1/FeatureServer`,
    tier: 'outlook',
  },

  // NWS public zone geometry for the alerts layer. The fire-weather and
  // marine zone catalogs already go through /api/noaa/*; this is the third
  // source useWeatherAlerts.js needs, routed the same way for consistency.
  // Zone boundaries are fixed reference data, hence static.
  'nws-zones': {
    origin: 'https://services2.arcgis.com',
    path: `/C8EMgrsFcRFL6LrL${REST}/LatestNWSZones/FeatureServer`,
    tier: 'static',
  },

  // CAL FIRE FRAP historical perimeters. src/app/api/calFirePerimeters.js
  // tries VITE_CALFIRE_FRAP_PROXY_URL (cloud/calfire-frap-proxy) first and
  // falls back to these two; that bespoke proxy is deliberately left alone,
  // but its fallbacks are worth caching since FRAP only reissues ~annually.
  'frap-egis': {
    origin: 'https://egis.fire.ca.gov',
    path: '/arcgis/rest/services/FRAP/FirePerimeters_FS/FeatureServer',
    tier: 'static',
  },
  'frap-mirror': {
    origin: 'https://services1.arcgis.com',
    path: `/jUJYIo9tSA7EHvfZ${REST}/California_Historic_Fire_Perimeters/FeatureServer`,
    tier: 'static',
  },

  // CAL FIRE FRAP public land ownership. This is the direct-to-ArcGIS
  // fallback src/app/api/californiaLandOwnership.js uses when
  // VITE_CALIFORNIA_LAND_OWNERSHIP_PROXY_URL is unset; routing it here gives
  // that path the shared cache its own comment says it lacks.
  //
  // Deliberately NOT quantized. The layer only loads at close zoom and
  // simplifies aggressively to keep a viewport near 25KB, so snapping the
  // envelope outward would inflate exactly the payload that file works to
  // keep small. Identical viewports still share an entry, which is the
  // common case when users return to the same area.
  'ca-land-ownership': {
    origin: 'https://jujyio9tsa7ehvfz.svcs1.arcgis.com',
    path: `/jUJYIo9tSA7EHvfZ${REST}/Public_Land_Ownership_view/FeatureServer`,
    tier: 'static',
  },

  // Infrastructure: essentially fixed geometry, fetched per viewport.
  'cmra-transmission': {
    origin: 'https://services2.arcgis.com',
    path: `/FiaPA4ga0iQKduv3${REST}/US_Electric_Power_Transmission_Lines/FeatureServer`,
    tier: 'static',
    geometryStep: 1,
  },
  'eia-gas': {
    origin: 'https://services2.arcgis.com',
    path: `/FiaPA4ga0iQKduv3${REST}/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer`,
    tier: 'static',
    geometryStep: 1,
  },
};

export default createProxy({
  prefix: '/api/arcgis',
  origin: 'https://services.arcgis.com',
  routes: ROUTES,
});

export { TIERS };
