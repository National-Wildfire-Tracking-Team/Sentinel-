/**
 * landfireFuels.js
 * LANDFIRE 40 Scott & Burgan Fire Behavior Fuel Models (FBFM40): a static,
 * 30 m map of the fuel type that would carry a fire, updated yearly. It says
 * nothing about how dry those fuels are today.
 *
 * Source: USGS/USFS LANDFIRE ImageServers on lfps.usgs.gov (no auth, public
 * domain), reached through the /api/arcgis edge proxy (routes in
 * netlify/edge-functions/arcgis-proxy.js), which pins the tile parameters
 * and caches tiles at the CDN. Drawn in the service's own renderer; a single
 * point is read with /identify.
 *
 *   CONUS:   LF2025 where released (western US so far), LF2024 elsewhere
 *   Alaska:  LF2025
 *   Hawaii, Puerto Rico / USVI: LF2024 (no LF2025 yet)
 *
 * Codes are the standard FBFM40 numeric values (Scott & Burgan 2005, RMRS-GTR-153).
 * Colours are LANDFIRE's, decoded from each service's /legend swatches
 * (2026-10). GR9 and SB4 appear in no current legend, so they have none.
 */

import { fetchJson } from './fetchJson';

export const LANDFIRE_SOURCE = 'LANDFIRE (USGS/USFS) · 40 Scott & Burgan Fire Behavior Fuel Models';
export const LANDFIRE_SOURCE_URL = 'https://landfire.gov/fuel/fbfm40';

const CONUS = [-128, 22, -65, 52];

/**
 * Services in draw order, bottom to top. `bounds` keeps tiles from being
 * requested outside a region. For a point lookup, services covering it are
 * tried newest first, so LF2024 answers only where LF2025 has no data.
 * `id` matches a LANDFIRE_SERVICES key in the arcgis proxy.
 */
export const LANDFIRE_FBFM40_SERVICES = [
  { id: 'conus-2024', label: 'CONUS', version: 'LF2024', bounds: CONUS },
  { id: 'conus-2025', label: 'CONUS', version: 'LF2025', bounds: CONUS },
  { id: 'ak-2025', label: 'Alaska', version: 'LF2025', bounds: [-180, 50, -129, 72] },
  { id: 'hi-2024', label: 'Hawaii', version: 'LF2024', bounds: [-161, 18.5, -154.5, 22.5] },
  { id: 'prvi-2024', label: 'Puerto Rico & USVI', version: 'LF2024', bounds: [-68, 17.5, -64.3, 18.8] },
];

export const FUEL_GROUPS = {
  NB: 'Non-burnable',
  GR: 'Grass',
  GS: 'Grass-shrub',
  SH: 'Shrub',
  TU: 'Timber-understory',
  TL: 'Timber litter',
  SB: 'Slash-blowdown',
};

/** FBFM40 code → model id, description, LANDFIRE colour. */
export const FBFM40 = {
  91: { model: 'NB1', name: 'Urban / developed', color: '#686868' },
  92: { model: 'NB2', name: 'Snow / ice', color: '#e1e1e1' },
  93: { model: 'NB3', name: 'Agricultural', color: '#ffeded' },
  98: { model: 'NB8', name: 'Open water', color: '#000ed6' },
  99: { model: 'NB9', name: 'Bare ground', color: '#4d6e70' },
  101: { model: 'GR1', name: 'Short, sparse, dry climate grass', color: '#ffebbe' },
  102: { model: 'GR2', name: 'Low load, dry climate grass', color: '#ffd373' },
  103: { model: 'GR3', name: 'Low load, very coarse, humid climate grass', color: '#ffec8b' },
  104: { model: 'GR4', name: 'Moderate load, dry climate grass', color: '#ffff73' },
  105: { model: 'GR5', name: 'Low load, humid climate grass', color: '#f5de29' },
  106: { model: 'GR6', name: 'Moderate load, humid climate grass', color: '#e6e640' },
  107: { model: 'GR7', name: 'High load, dry climate grass', color: '#cdc673' },
  108: { model: 'GR8', name: 'High load, very coarse, humid climate grass', color: '#8b864e' },
  109: { model: 'GR9', name: 'Very high load, humid climate grass', color: null },
  121: { model: 'GS1', name: 'Low load, dry climate grass-shrub', color: '#ffaa00' },
  122: { model: 'GS2', name: 'Moderate load, dry climate grass-shrub', color: '#ffa77f' },
  123: { model: 'GS3', name: 'Moderate load, humid climate grass-shrub', color: '#ff6300' },
  124: { model: 'GS4', name: 'High load, humid climate grass-shrub', color: '#cd6600' },
  141: { model: 'SH1', name: 'Low load, dry climate shrub', color: '#d7c29e' },
  142: { model: 'SH2', name: 'Moderate load, dry climate shrub', color: '#d7b09e' },
  143: { model: 'SH3', name: 'Moderate load, humid climate shrub', color: '#cd8966' },
  144: { model: 'SH4', name: 'Low load, humid climate timber-shrub', color: '#895a44' },
  145: { model: 'SH5', name: 'High load, dry climate shrub', color: '#cdaa66' },
  146: { model: 'SH6', name: 'Low load, humid climate shrub', color: '#ed7044' },
  147: { model: 'SH7', name: 'Very high load, dry climate shrub', color: '#cd7d39' },
  148: { model: 'SH8', name: 'High load, humid climate shrub', color: '#a83800' },
  149: { model: 'SH9', name: 'Very high load, humid climate shrub', color: '#731a00' },
  161: { model: 'TU1', name: 'Low load, dry climate timber-grass-shrub', color: '#e9ffbe' },
  162: { model: 'TU2', name: 'Moderate load, humid climate timber-shrub', color: '#aaff00' },
  163: { model: 'TU3', name: 'Moderate load, humid climate timber-grass-shrub', color: '#b4d79e' },
  164: { model: 'TU4', name: 'Dwarf conifer with understory', color: '#70a800' },
  165: { model: 'TU5', name: 'Very high load, dry climate timber-shrub', color: '#267300' },
  181: { model: 'TL1', name: 'Low load, compact conifer litter', color: '#beffe8' },
  182: { model: 'TL2', name: 'Low load broadleaf litter', color: '#00ffc5' },
  183: { model: 'TL3', name: 'Moderate load conifer litter', color: '#bed2ff' },
  184: { model: 'TL4', name: 'Small downed logs', color: '#7b68ee' },
  185: { model: 'TL5', name: 'High load conifer litter', color: '#bee8ff' },
  186: { model: 'TL6', name: 'Moderate load broadleaf litter', color: '#00c5ff' },
  187: { model: 'TL7', name: 'Large downed logs', color: '#0084a8' },
  188: { model: 'TL8', name: 'Long-needle litter', color: '#005ce6' },
  189: { model: 'TL9', name: 'Very high load broadleaf litter', color: '#4d6e91' },
  201: { model: 'SB1', name: 'Low load activity fuel', color: '#e8beff' },
  202: { model: 'SB2', name: 'Moderate load activity fuel or low load blowdown', color: '#c500ff' },
  203: { model: 'SB3', name: 'High load activity fuel or moderate load blowdown', color: '#ffbee8' },
  204: { model: 'SB4', name: 'High load blowdown', color: null },
};

/** Look up a raw pixel value. null for NoData / unknown codes. */
export function describeFuelModel(value) {
  const code = Number(value);
  const entry = Number.isInteger(code) ? FBFM40[code] : null;
  if (!entry) return null;
  const group = entry.model.slice(0, 2);
  return { code, ...entry, group, groupLabel: FUEL_GROUPS[group], burnable: group !== 'NB' };
}

/** Legend rows, one per fuel group, using LANDFIRE colours (models listed in each). */
export function fuelLegendGroups() {
  const groups = {};
  for (const entry of Object.values(FBFM40)) {
    if (!entry.color) continue;
    const g = entry.model.slice(0, 2);
    (groups[g] ||= []).push({ model: entry.model, name: entry.name, color: entry.color });
  }
  return Object.entries(FUEL_GROUPS).map(([id, label]) => ({ id, label, models: groups[id] ?? [] }));
}

/** mapbox-gl raster tile URL template for one service, via the edge proxy (Web Mercator, transparent NoData). */
export function landfireTileUrl(service) {
  return `/api/arcgis/lf-${service.id}-tiles/exportImage?bbox={bbox-epsg-3857}&f=image`;
}

/** Services covering a point, newest release first. Empty outside coverage. */
export function landfireServicesFor(lat, lng) {
  return LANDFIRE_FBFM40_SERVICES
    .filter(({ bounds: [w, s, e, n] }) => lng >= w && lng <= e && lat >= s && lat <= n)
    .sort((a, b) => b.version.localeCompare(a.version));
}

async function identify(service, lat, lng) {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: Number(lng.toFixed(5)), y: Number(lat.toFixed(5)), spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    returnGeometry: 'false',
    f: 'json',
  });
  const key = `landfire:fbfm40:${service.id}:${lat.toFixed(4)},${lng.toFixed(4)}`;
  // The map is yearly; a day-long cache only avoids repeat lookups.
  const data = await fetchJson(`/api/arcgis/lf-${service.id}/identify?${params}`, key, 24 * 60 * 60 * 1000);
  return describeFuelModel(data?.value);
}

/**
 * The fuel model at a point. Resolves { service, fuel } from the newest
 * release with data there (fuel null when none has data), or null when no
 * service covers the point. Rejects on network or service errors.
 */
export async function fetchFuelModelAt(lat, lng) {
  const services = landfireServicesFor(lat, lng);
  if (!services.length) return null;
  for (const service of services) {
    const fuel = await identify(service, lat, lng);
    if (fuel) return { service, fuel };
  }
  return { service: services[services.length - 1], fuel: null };
}
