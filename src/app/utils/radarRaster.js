/**
 * radarRaster.js
 * Rasterizes a decoded NEXRAD scan payload (a polar sweep: per-radial
 * azimuth + range-gate values) into a georeferenced canvas image for
 * display as a Mapbox GL `image` source.
 *
 * Uses a local flat-earth approximation (meters-per-degree evaluated at the
 * site's own latitude) to place the square image's four corners — accurate
 * for one radar's few-hundred-km range, not survey-grade at the outer edge
 * of very long sweeps. This is the same approximation most lightweight web
 * radar viewers use.
 */

const CANVAS_SIZE = 768; // px, square output — NexradScanLayer.jsx renders this with 'nearest' raster-resampling (no GPU smoothing), so resolution here is what determines on-screen grain
const METERS_PER_DEG_LAT = 111320;

// Standard NWS/NOAA base reflectivity color table (the familiar
// cyan->blue->green->yellow->orange->red->magenta->purple->white bands used
// by weather.gov, GRLevel3, and IEM's own NEXRAD WMS mosaic — which this
// project's RadarLayer.jsx fallback already renders server-side, so this
// keeps the primary MRMS source and that fallback visually identical), with
// saturation reduced three times from the standard table's fully-saturated
// values: 10% (S x0.9), then a further 20% (S x0.8), then a further 10%
// (S x0.9) — ~0.648x the original saturation overall — hue and lightness
// unchanged throughout.
// Discrete 5-dBZ steps from 5 dBZ up; nothing below 5 dBZ is rendered (see
// belowMinIsNoData in colorForProduct below), matching standard practice of
// not displaying sub-5-dBZ returns.
//
// Shared (imported, not duplicated) by mrmsRaster.js so Composite and
// NEXRAD Level II reflectivity render with the identical palette — see
// that file's module doc comment. This is a shared color constant only;
// each renderer's actual rasterization pipeline (polar sweep vs. regular
// grid) remains fully independent.
export const REFLECTIVITY_SCALE = [
  { min: 5, color: '#2cc1c0' },  // 5-10 dBZ
  { min: 10, color: '#2c92c9' }, // 10-15 dBZ
  { min: 15, color: '#2d2bc9' }, // 15-20 dBZ
  { min: 20, color: '#2ed12e' }, // 20-25 dBZ
  { min: 25, color: '#23a323' }, // 25-30 dBZ
  { min: 30, color: '#197519' }, // 30-35 dBZ
  { min: 35, color: '#d1cd2e' }, // 35-40 dBZ
  { min: 40, color: '#bda228' }, // 40-45 dBZ
  { min: 45, color: '#d18d2c' }, // 45-50 dBZ
  { min: 50, color: '#d12c2c' }, // 50-55 dBZ
  { min: 55, color: '#ae2626' }, // 55-60 dBZ
  { min: 60, color: '#9b2121' }, // 60-65 dBZ
  { min: 65, color: '#cd2cd1' }, // 65-70 dBZ
  { min: 70, color: '#9468b2' }, // 70-75 dBZ
  { min: 75, color: '#fdfdfd' }, // 75+ dBZ (already achromatic, unaffected)
];

// Standard NWS-style diverging velocity scale: green = toward radar
// (negative), red = away from radar (positive).
export const VELOCITY_SCALE = [
  { min: -100, color: '#00ff00' },
  { min: -50, color: '#008000' },
  { min: -10, color: '#e8ffe8' },
  { min: 10, color: '#ffe8e8' },
  { min: 50, color: '#800000' },
  { min: 100, color: '#ff0000' },
];

// Spectrum width (knots) — a QC/turbulence diagnostic, not a precip-intensity
// field, so a simple calm-to-turbulent gradient rather than a dense banded
// scale. Muted to match REFLECTIVITY_SCALE's desaturated house style, not
// the raw neon convention some NWS viewers use.
export const SPECTRUM_WIDTH_SCALE = [
  { min: 0, color: '#8fb3c9' },  // calm / laminar (most common)
  { min: 4, color: '#5fa88f' },
  { min: 8, color: '#c9b568' },
  { min: 12, color: '#c98a4a' },
  { min: 18, color: '#b8523f' }, // turbulent (mesocyclone/tornado signature)
  { min: 25, color: '#7a3030' },
];

// Differential reflectivity (dB) — muted version of the conventional NWS
// ZDR palette (negative/blue -> near-zero/green -> positive/warm -> very
// high/pink for biological or huge-drop returns). Reserves the coldest
// colors for the rare, strongly-negative values sometimes seen in hail.
export const ZDR_SCALE = [
  { min: -13, color: '#5b5ba6' }, // rare, strongly negative (hail signature)
  { min: -1, color: '#5f8fa8' },
  { min: 0, color: '#5fa88f' },   // near-zero — small/round drops, most common
  { min: 1, color: '#8fb35f' },
  { min: 2, color: '#c9b568' },
  { min: 3, color: '#c98a4a' },
  { min: 4, color: '#b8523f' },
  { min: 6, color: '#7a3030' },
  { min: 10, color: '#a65fa6' },  // very high — biological/large drops
];

// Correlation coefficient (unitless, 0-~1.05) — the meteorologically
// interesting range is compressed near 1.0 (pure precipitation), so bands
// are deliberately non-uniform: wide at the low end (non-meteorological
// scatterers/debris — a single "low CC" signal is what matters there) and
// narrow near 1.0 (where subtle drops matter for hail/debris detection).
export const CC_SCALE = [
  { min: 0.2, color: '#6b4a8a' },  // debris / non-meteorological
  { min: 0.7, color: '#5f7fa8' },
  { min: 0.85, color: '#5fa8a0' },
  { min: 0.93, color: '#5fa87d' },
  { min: 0.97, color: '#8fb35f' },
  { min: 0.99, color: '#c9b568' }, // near-perfect correlation — typical rain
];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function bandColor(value, scale, belowMinIsNoData) {
  if (belowMinIsNoData && value < scale[0].min) return null;
  let match = scale[0];
  for (const stop of scale) {
    if (value >= stop.min) match = stop;
  }
  return hexToRgb(match.color);
}

// NEXRAD Level II hides reflectivity below 20 dBZ — a stricter, NEXRAD-only
// threshold than REFLECTIVITY_SCALE's own first band (5 dBZ, still used
// as-is by MRMS Composite via mrmsRaster.js's own bandColor). Kept as a
// separate constant rather than changing the shared scale's first stop so
// Composite's display threshold is unaffected.
const NEXRAD_REFLECTIVITY_HIDE_BELOW_DBZ = 20;

function colorForProduct(product, realValue) {
  if (product === 'reflectivity') {
    // Below-threshold returns are left transparent rather than colored. The
    // real no-data sentinel is handled separately, before colorForProduct is
    // ever called (see rasterizeSweep's noDataByte check below).
    if (realValue < NEXRAD_REFLECTIVITY_HIDE_BELOW_DBZ) return null;
    return bandColor(realValue, REFLECTIVITY_SCALE, false);
  }
  if (product === 'velocity') return bandColor(realValue, VELOCITY_SCALE, false);
  // Spectrum width, ZDR, and CC are all diagnostically meaningful across
  // their entire range (unlike reflectivity, where very light returns are
  // deliberately hidden as visual noise) — belowMinIsNoData stays false so
  // no part of the real, decoded range is hidden. The actual no-data
  // sentinel (undecoded/below-threshold gates) is handled separately, before
  // colorForProduct is ever called — see rasterizeSweep's noDataByte check.
  if (product === 'spectrumWidth') return bandColor(realValue, SPECTRUM_WIDTH_SCALE, false);
  if (product === 'zdr') return bandColor(realValue, ZDR_SCALE, false);
  if (product === 'cc') return bandColor(realValue, CC_SCALE, false);
  return null;
}

// Every gate value is one quantized byte (0-254; 255 is the reserved
// no-data sentinel handled separately), and `real = raw * scale + offset`
// plus the color-band lookup are both pure functions of that byte alone for
// a given product's fixed scale/offset — so instead of re-deriving a color
// from the raw byte on every one of a 768x768 canvas's pixels, precompute
// the 255 possible outputs once per rasterizeSweep() call and index into
// that table per pixel. Packed as one Int32 per entry (bit 24 = has-color,
// bits 0-23 = RGB) so the hot loop does a single array read instead of a
// hexToRgb() string-parse + linear scale scan.
export function buildColorLut(product, scale, offset) {
  const lut = new Int32Array(255);
  for (let raw = 0; raw < 255; raw++) {
    const rgb = colorForProduct(product, raw * scale + offset);
    lut[raw] = rgb ? (1 << 24) | rgb[0] | (rgb[1] << 8) | (rgb[2] << 16) : 0;
  }
  return lut;
}

const COLOR_LUT_CACHE_MAX = 8;
const colorLutCache = new Map(); // "product|scale|offset" -> Int32Array(255)

function getColorLut(product, scale, offset) {
  const key = `${product}|${scale}|${offset}`;
  let lut = colorLutCache.get(key);
  if (lut) return lut;
  lut = buildColorLut(product, scale, offset);
  colorLutCache.set(key, lut);
  if (colorLutCache.size > COLOR_LUT_CACHE_MAX) {
    colorLutCache.delete(colorLutCache.keys().next().value);
  }
  return lut;
}

// Per-pixel range (meters from site) and azimuth (degrees) depend only on
// the canvas geometry and this product's fixed maxRangeM/firstGateM — never
// on a particular scan's radial data — so they're identical across every
// scan of the same product. Precomputing them once per distinct
// maxRangeM/firstGateM combination (in practice: one per product, ever)
// skips a Math.hypot + Math.atan2 pair per pixel on every rasterization
// after the first for that product.
export function buildGeometryLut(maxRangeM, firstGateM, canvasSize) {
  const metersPerPixel = (2 * maxRangeM) / canvasSize;
  const half = canvasSize / 2;
  const n = canvasSize * canvasSize;
  const rangeArr = new Float64Array(n);
  const azArr = new Float64Array(n);
  const inRange = new Uint8Array(n);

  for (let py = 0; py < canvasSize; py++) {
    for (let px = 0; px < canvasSize; px++) {
      const i = py * canvasSize + px;
      const xMeters = (px - half + 0.5) * metersPerPixel;
      const yMeters = (half - py - 0.5) * metersPerPixel;
      const range = Math.hypot(xMeters, yMeters);
      rangeArr[i] = range;
      if (range > maxRangeM || range < firstGateM) continue;
      inRange[i] = 1;
      azArr[i] = (Math.atan2(xMeters, yMeters) * 180 / Math.PI + 360) % 360;
    }
  }
  return { rangeArr, azArr, inRange };
}

const GEOMETRY_LUT_CACHE_MAX = 8;
const geometryLutCache = new Map(); // "maxRangeM|firstGateM" -> {rangeArr, azArr, inRange}

function getGeometryLut(maxRangeM, firstGateM, canvasSize) {
  const key = `${maxRangeM}|${firstGateM}|${canvasSize}`;
  let geometry = geometryLutCache.get(key);
  if (geometry) return geometry;
  geometry = buildGeometryLut(maxRangeM, firstGateM, canvasSize);
  geometryLutCache.set(key, geometry);
  if (geometryLutCache.size > GEOMETRY_LUT_CACHE_MAX) {
    geometryLutCache.delete(geometryLutCache.keys().next().value);
  }
  return geometry;
}

/**
 * @param {ReturnType<import('./nexradPayloadFormat').decodeScanPayload>} payload
 * @param {{lat: number, lng: number}} site
 * @returns {{ dataUrl: string, coordinates: [number, number][] } | null}
 */
export function rasterizeSweep(payload, site) {
  if (!payload || site?.lat == null || site?.lng == null) return null;

  const { product, azimuths, values, gateCount, gateSizeM, firstGateM, scale, offset, noDataByte } = payload;
  if (!azimuths?.length || !values?.length || !gateCount) return null;

  const maxRangeM = firstGateM + gateCount * gateSizeM;

  // Sort radial indices by azimuth once, for nearest-azimuth binary search.
  const order = Array.from(azimuths.keys()).sort((a, b) => azimuths[a] - azimuths[b]);
  const sortedAz = order.map((i) => azimuths[i]);

  function nearestRadialIndex(azDeg) {
    const n = sortedAz.length;
    if (azDeg <= sortedAz[0] || azDeg >= sortedAz[n - 1]) {
      const dFirst = Math.min(Math.abs(azDeg - sortedAz[0]), 360 - Math.abs(azDeg - sortedAz[0]));
      const dLast = Math.min(Math.abs(azDeg - sortedAz[n - 1]), 360 - Math.abs(azDeg - sortedAz[n - 1]));
      return dFirst <= dLast ? order[0] : order[n - 1];
    }
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (sortedAz[mid] < azDeg) lo = mid;
      else hi = mid;
    }
    return azDeg - sortedAz[lo] <= sortedAz[hi] - azDeg ? order[lo] : order[hi];
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);

  const colorLut = getColorLut(product, scale, offset);
  const { rangeArr, azArr, inRange } = getGeometryLut(maxRangeM, firstGateM, CANVAS_SIZE);

  for (let py = 0; py < CANVAS_SIZE; py++) {
    for (let px = 0; px < CANVAS_SIZE; px++) {
      const i = py * CANVAS_SIZE + px;
      const idx = i * 4;

      if (!inRange[i]) {
        imageData.data[idx + 3] = 0;
        continue;
      }

      const radialIdx = nearestRadialIndex(azArr[i]);
      const gateIdx = Math.min(gateCount - 1, Math.max(0, Math.floor((rangeArr[i] - firstGateM) / gateSizeM)));
      const raw = values[radialIdx * gateCount + gateIdx];

      if (raw === noDataByte) {
        imageData.data[idx + 3] = 0;
        continue;
      }

      const packed = colorLut[raw];
      if (!(packed & (1 << 24))) {
        imageData.data[idx + 3] = 0;
        continue;
      }

      imageData.data[idx] = packed & 255;
      imageData.data[idx + 1] = (packed >> 8) & 255;
      imageData.data[idx + 2] = (packed >> 16) & 255;
      imageData.data[idx + 3] = 220;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const siteLatRad = (site.lat * Math.PI) / 180;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(siteLatRad);
  const halfDegLat = maxRangeM / METERS_PER_DEG_LAT;
  const halfDegLon = maxRangeM / metersPerDegLon;

  const coordinates = [
    [site.lng - halfDegLon, site.lat + halfDegLat], // top-left
    [site.lng + halfDegLon, site.lat + halfDegLat], // top-right
    [site.lng + halfDegLon, site.lat - halfDegLat], // bottom-right
    [site.lng - halfDegLon, site.lat - halfDegLat], // bottom-left
  ];

  return { dataUrl: canvas.toDataURL('image/png'), coordinates };
}
