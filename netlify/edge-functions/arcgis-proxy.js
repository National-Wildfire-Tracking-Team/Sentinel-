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

/**
 * LANDFIRE FBFM40 fuel model ImageServers (lfps.usgs.gov), for the Fire
 * Danger & Fuels layer. Two routes per service:
 *   lf-<id>        point /identify
 *   lf-<id>-tiles  /exportImage map tiles; the export parameters are pinned
 *                  here so the client sends only `bbox` and `f`, and every
 *                  viewer of a tile shares one cache entry.
 * LANDFIRE maps are reissued about yearly, hence the static tier. Going
 * through the proxy also gives the upstream a fixed User-Agent: lfps.usgs.gov
 * answers some browser agents (e.g. headless Chrome) with a CORS-less 500.
 *
 * LF2025 CONUS covers only the western US so far (2026-10: NoData from TX,
 * KS, MN and eastward), so LF2024 CONUS is drawn beneath it.
 */
export const LANDFIRE_SERVICES = {
  'conus-2024': 'Landfire_LF2024/LF2024_FBFM40_CONUS',
  'conus-2025': 'Landfire_LF2025/LF2025_FBFM40_CONUS',
  'ak-2025': 'Landfire_LF2025/LF2025_FBFM40_AK',
  'hi-2024': 'Landfire_LF2024/LF2024_FBFM40_HI',
  'prvi-2024': 'Landfire_LF2024/LF2024_FBFM40_PRVI',
};

const LANDFIRE_TILE_PARAMS = {
  bboxSR: '3857',
  imageSR: '3857',
  size: '256,256',
  format: 'png32',
  transparent: 'true',
};

/**
 * USGS EROS fire danger forecast: Wildland Fire Potential Index (WFPI), a
 * USGS model (not NFDRS), as a GeoServer WMS per forecast day 1-7. Layer N's
 * default time is day N of USGS's newest run. Same two-route shape as
 * LANDFIRE: tiles (client sends `bbox`) and a 3x3-pixel GetFeatureInfo for
 * one point (client sends a small EPSG:4326 `bbox` around it). The host also
 * answers headless browser agents with a 500, hence the proxy.
 */
export const WFPI_DAYS = [1, 2, 3, 4, 5, 6, 7];
const WFPI_ROUTES = Object.fromEntries(
  WFPI_DAYS.flatMap((day) => {
    const layer = `wfpi-forecast-${day}_conus_day_data`;
    const base = { origin: 'https://dmsdata.cr.usgs.gov', path: `/geoserver/firedanger_${layer}/wms`, tier: 'outlook' };
    const wms = { service: 'WMS', version: '1.3.0', layers: layer, styles: '' };
    return [
      [`usgs-wfpi-${day}-tiles`, { ...base, forcedParams: {
        ...wms, request: 'GetMap', crs: 'EPSG:3857', width: '256', height: '256', format: 'image/png', transparent: 'true',
      } }],
      [`usgs-wfpi-${day}`, { ...base, forcedParams: {
        ...wms, request: 'GetFeatureInfo', query_layers: layer, crs: 'EPSG:4326', width: '3', height: '3', i: '1', j: '1',
        info_format: 'application/json',
      } }],
    ];
  }),
);

const LANDFIRE_ROUTES = Object.fromEntries(
  Object.entries(LANDFIRE_SERVICES).flatMap(([id, service]) => {
    const base = { origin: 'https://lfps.usgs.gov', path: `${REST}/${service}/ImageServer`, tier: 'static' };
    return [
      [`lf-${id}`, base],
      [`lf-${id}-tiles`, { ...base, forcedParams: LANDFIRE_TILE_PARAMS }],
    ];
  }),
);

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

  // NWCG Predictive Services 7-day Significant Fire Potential (layers 0-6 =
  // Day 1-7), for the Fire Danger & Fuels layer. A self-hosted ArcGIS Server,
  // not ArcGIS Online, hence its own origin. Issued daily but filled in area
  // by area through the morning, so the outlook tier's 10-minute window.
  'nwcg-sfp': {
    origin: 'https://fsapps.nwcg.gov',
    path: '/psp/arcgis/rest/services/npsg/outlooks_forecast/MapServer',
    tier: 'outlook',
  },

  // NWCC-hosted mirror of FEMS fuel moisture field samples (WA, OR, ID, MT,
  // WY, SD, ND), labelled "Testing NWCC Fuel Moisture" by its owner. The only
  // public, current source of measured live fuel moisture found (2026-10).
  // Samples are entered a few times a week.
  'nwcc-fuel-moisture': {
    origin: 'https://services3.arcgis.com',
    path: `/T4QMspbfLg3qTGWY${REST}/NWCC_FEMS_Fuel_Moisture/FeatureServer`,
    tier: 'outlook',
  },

  ...LANDFIRE_ROUTES,
  ...WFPI_ROUTES,

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
