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

const CANVAS_SIZE = 768; // px, square output — higher res + linear raster-resampling on the Mapbox layer softens the polar-to-grid blockiness
const METERS_PER_DEG_LAT = 111320;

// Reflectivity color table, built around NOAA's JetStream reflectivity
// guidance (https://www.noaa.gov/jetstream/reflectivity): discrete 5-dBZ
// steps from 15-65 dBZ, plus two additional low-end bins below the
// mandated <15 dBZ threshold so genuinely valid low-reflectivity data
// (drizzle, snow, general clutter — NOAA's own -35 to 0 and 0 to 20 dBZ
// bands) stays visible rather than being discarded as no-data. The scale
// is deliberately NOT a rainfall-rate mapping — dBZ is returned radar
// energy, not a direct precipitation-intensity measurement, so bins are
// labeled by dBZ range only (see Legend.jsx) rather than "light/moderate/
// heavy" rain descriptors.
//
// -35 to 0 and 0 to 15 are intentionally the most muted/desaturated colors
// in the table (low visual weight) so they read as background texture —
// distinguishable from true no-data (fully transparent, a separate
// mechanism — see rasterizeSweep's noDataByte check below) without
// competing with real precipitation signal.
//
// Shared (imported, not duplicated) by mrmsRaster.js so Composite and
// NEXRAD Level II reflectivity render with the identical NOAA-based
// palette — see that file's module doc comment. This is a shared color
// constant only; each renderer's actual rasterization pipeline (polar
// sweep vs. regular grid) remains fully independent.
export const REFLECTIVITY_SCALE = [
  { min: -35, color: '#39424a' }, // -35 to 0 dBZ — extremely light / drizzle / snow / clutter
  { min: 0, color: '#55655f' },   // 0 to 15 dBZ — very light precipitation or general clutter
  { min: 15, color: '#7dcf7d' },  // 15-20 dBZ — Light Green
  { min: 20, color: '#4caf50' },  // 20-25 dBZ — Green
  { min: 25, color: '#2f7d32' },  // 25-30 dBZ — Dark Green
  { min: 30, color: '#e8dc8a' },  // 30-35 dBZ — Light Yellow
  { min: 35, color: '#d4bf4d' },  // 35-40 dBZ — Yellow
  { min: 40, color: '#cc8a3d' },  // 40-45 dBZ — Dark Yellow / Orange
  { min: 45, color: '#c1663f' },  // 45-50 dBZ — Red-Orange / Light Red
  { min: 50, color: '#b8433c' },  // 50-55 dBZ — Red
  { min: 55, color: '#7a3030' },  // 55-60 dBZ — Dark Red
  { min: 60, color: '#b563b5' },  // 60-65 dBZ — Fuchsia / Pink
  { min: 65, color: '#e8dcef' },  // >65 dBZ — White / Light Purple (extreme, possible water-coated hail)
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

function colorForProduct(product, realValue) {
  // false: reflectivity's own scale now starts at -35 dBZ (see
  // REFLECTIVITY_SCALE above) specifically so genuinely valid low-end
  // values are preserved and colored, not discarded as no-data — the real
  // no-data sentinel is handled separately, before colorForProduct is ever
  // called (see rasterizeSweep's noDataByte check below).
  if (product === 'reflectivity') return bandColor(realValue, REFLECTIVITY_SCALE, false);
  if (product === 'velocity') return bandColor(realValue, VELOCITY_SCALE, false);
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
