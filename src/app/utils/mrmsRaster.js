/**
 * mrmsRaster.js
 * Rasterizes a decoded NOAA MRMS composite reflectivity payload (a regular
 * geographic grid) into a canvas image for display as a Mapbox GL `image`
 * source.
 *
 * Deliberately NOT a variant of radarRaster.js's rasterizeSweep: that
 * function projects NEXRAD's polar radial geometry (azimuth + range gate)
 * onto a square canvas — a fundamentally different problem from painting a
 * regular grid, where each grid cell already maps directly to one pixel.
 * Only the reflectivity color scale is shared (imported, not duplicated) so
 * Composite and NEXRAD Level II render with one consistent palette.
 *
 * The payload's grid is already row 0 = north, column 0 = west, with rows
 * pre-resampled onto Web Mercator-uniform spacing by the ingestion script
 * (see scripts/mrms-radar-sync.mjs) — so rendering here is a direct 1:1
 * pixel copy, no reprojection math needed client-side.
 */

import { REFLECTIVITY_SCALE } from './radarRaster';

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function bandColor(value) {
  if (value < REFLECTIVITY_SCALE[0].min) return null;
  let match = REFLECTIVITY_SCALE[0];
  for (const stop of REFLECTIVITY_SCALE) {
    if (value >= stop.min) match = stop;
  }
  return hexToRgb(match.color);
}

/**
 * @param {ReturnType<import('./mrmsPayloadFormat').decodeMrmsPayload>} payload
 * @returns {{ dataUrl: string, coordinates: [number, number][] } | null}
 */
export function rasterizeMrmsFrame(payload) {
  if (!payload) return null;
  const { gridWidth, gridHeight, values, scale, offset, noDataByte, west, east, south, north } = payload;
  if (!gridWidth || !gridHeight || !values?.length) return null;

  const canvas = document.createElement('canvas');
  canvas.width = gridWidth;
  canvas.height = gridHeight;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(gridWidth, gridHeight);

  for (let i = 0; i < values.length; i++) {
    const raw = values[i];
    const idx = i * 4;

    if (raw === noDataByte) {
      imageData.data[idx + 3] = 0;
      continue;
    }

    const real = raw * scale + offset;
    const rgb = bandColor(real);
    if (!rgb) {
      imageData.data[idx + 3] = 0;
      continue;
    }

    imageData.data[idx] = rgb[0];
    imageData.data[idx + 1] = rgb[1];
    imageData.data[idx + 2] = rgb[2];
    // Full alpha here — dimming already happens once, via the Mapbox layer's
    // own raster-opacity (RadarLayer.jsx). Baking a second dim in here on
    // top of that stacked into a washed-out look unlike normal radar color
    // coding.
    imageData.data[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);

  // Row 0 = north, column 0 = west (see module doc comment) — corners map
  // directly from the payload's bounds with no further transform.
  const coordinates = [
    [west, north], // top-left
    [east, north], // top-right
    [east, south], // bottom-right
    [west, south], // bottom-left
  ];

  return { dataUrl: canvas.toDataURL('image/png'), coordinates };
}
