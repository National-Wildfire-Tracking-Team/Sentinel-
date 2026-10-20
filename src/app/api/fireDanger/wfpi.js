/**
 * wfpi.js
 * USGS EROS Wildland Fire Potential Index (WFPI) forecast: a gridded (~1 km,
 * CONUS) USGS model of vegetation flammability, 7 forecast days, drawn by
 * USGS's GeoServer and reached through the /api/arcgis/usgs-wfpi-* edge
 * routes (netlify/edge-functions/arcgis-proxy.js), which pin the WMS
 * parameters. It is a USGS model, not an NFDRS index or an official rating.
 *
 * Layer N shows day N of USGS's newest run; the valid dates come from the
 * fire danger manifest (cloud/fire-danger reads the WMS time dimension), so
 * without it a day is labelled by number only.
 *
 * Legend: USGS's own (GetLegendGraphic, 2026-10-20). Pixel values 0-247 are
 * the index; 249-254 are land-cover codes with no index.
 */

import { fetchJson } from './fetchJson';

export const WFPI_DAYS = [1, 2, 3, 4, 5, 6, 7];
export const WFPI_SOURCE = 'USGS EROS · Wildland Fire Potential Index forecast';
export const WFPI_SOURCE_URL = 'https://www.usgs.gov/fire-danger-forecast/wildland-fire-potential-index-wfpi';
export const WFPI_BOUNDS = [-128, 22, -65, 52];

/** [upper bound (exclusive), colour, label] in USGS's legend order. */
export const WFPI_CLASSES = [
  [11, '#004500', '0–10'],
  [21, '#006100', '11–20'],
  [31, '#0f8208', '21–30'],
  [41, '#40a621', '31–40'],
  [51, '#7ad445', '41–50'],
  [61, '#c2ff6e', '51–60'],
  [71, '#ffff19', '61–70'],
  [81, '#cf703d', '71–80'],
  [91, '#961900', '81–90'],
  [101, '#bf0000', '91–100'],
  [121, '#ff8000', '101–120'],
  [141, '#ff00ff', '121–140'],
  [248, '#ff0000', '141+'],
];

/** Non-index pixel codes in USGS's legend. */
export const WFPI_CODES = {
  249: 'Outside the US',
  250: 'Snow / ice',
  251: 'Agricultural land',
  252: 'Barren',
  253: 'Marsh',
  254: 'Water',
};

export function wfpiTileUrl(day) {
  return `/api/arcgis/usgs-wfpi-${day}-tiles?bbox={bbox-epsg-3857}`;
}

/** Reads a GetFeatureInfo value: { index } for 0-247, { code, label } for land-cover codes, null otherwise. */
export function describeWfpi(value) {
  const v = Number(value);
  if (!Number.isInteger(v)) return null;
  if (v >= 0 && v <= 247) {
    const cls = WFPI_CLASSES.find(([hi]) => v < hi);
    return { index: v, color: cls[1] };
  }
  if (WFPI_CODES[v]) return { code: v, label: WFPI_CODES[v] };
  return null;
}

/**
 * WFPI at a point for forecast day `day`. WMS 1.3.0 with EPSG:4326 takes the
 * bbox as lat,lon order; the proxy asks for the centre of a 3x3-pixel box.
 */
export async function fetchWfpiAt(day, lat, lng) {
  const d = 0.005;
  const bbox = [lat - d, lng - d, lat + d, lng + d].map((n) => n.toFixed(5)).join(',');
  const key = `usgs:wfpi:${day}:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const data = await fetchJson(`/api/arcgis/usgs-wfpi-${day}?bbox=${bbox}`, key, 30 * 60 * 1000);
  return describeWfpi(data?.features?.[0]?.properties?.PALETTE_INDEX);
}

/** The forecast day (1-7) whose valid date is `today`, else 1. */
export function defaultWfpiDay(validDates, today) {
  const i = (validDates ?? []).indexOf(today);
  return i >= 0 ? i + 1 : 1;
}
