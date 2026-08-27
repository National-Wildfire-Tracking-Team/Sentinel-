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

const CANVAS_SIZE = 1024; // px, square output — higher res + linear raster-resampling on the Mapbox layer softens the polar-to-grid blockiness
const METERS_PER_DEG_LAT = 111320;

// Reuses the same band thresholds as Legend.jsx's RADAR_DBZ_SCALE so the
// live sweep's colors match the existing NEXRAD composite legend.
export const REFLECTIVITY_SCALE = [
  { min: 5, color: '#04e9e7' },
  { min: 15, color: '#009df4' },
  { min: 20, color: '#01c501' },
  { min: 30, color: '#fdf802' },
  { min: 40, color: '#e5bc00' },
  { min: 45, color: '#fd9500' },
  { min: 50, color: '#fd0000' },
  { min: 55, color: '#d40000' },
  { min: 60, color: '#bc0000' },
  { min: 65, color: '#f800fd' },
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
  if (product === 'reflectivity') return bandColor(realValue, REFLECTIVITY_SCALE, true);
  if (product === 'velocity') return bandColor(realValue, VELOCITY_SCALE, false);
  return null;
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
  const n = sortedAz.length;

  // Median azimuth spacing — used to tell a genuine radial-to-radial gap
  // (normal beam spacing) from a real hole in the sweep (e.g. an unscanned
  // sector), so interpolation doesn't smear a gap into fabricated color.
  const gaps = sortedAz.map((az, i) => (i === 0 ? az + 360 - sortedAz[n - 1] : az - sortedAz[i - 1])).sort((a, b) => a - b);
  const medianGapDeg = gaps[Math.floor(n / 2)] || 1;
  const MAX_BRACKET_GAP_DEG = medianGapDeg * 3;

  // Bracketing radial indices either side of azDeg, plus the interpolation
  // weight toward the second one. Falls back to a single radial (weight 0)
  // when the true neighbor is further away than a normal beam gap.
  function bracketRadials(azDeg) {
    let lo = 0;
    let hi = n - 1;
    let wrapGapDeg;
    let loAz;
    let hiAz;
    if (azDeg <= sortedAz[0] || azDeg >= sortedAz[n - 1]) {
      lo = n - 1;
      hi = 0;
      loAz = sortedAz[n - 1];
      hiAz = sortedAz[0] + 360;
      wrapGapDeg = hiAz - loAz;
    } else {
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (sortedAz[mid] < azDeg) lo = mid;
        else hi = mid;
      }
      loAz = sortedAz[lo];
      hiAz = sortedAz[hi];
      wrapGapDeg = hiAz - loAz;
    }
    if (wrapGapDeg > MAX_BRACKET_GAP_DEG) {
      const dLo = Math.min(Math.abs(azDeg - loAz), 360 - Math.abs(azDeg - loAz));
      const dHi = Math.min(Math.abs(azDeg - hiAz), 360 - Math.abs(azDeg - hiAz));
      return dLo <= dHi ? [order[lo], order[lo], 0] : [order[hi % n], order[hi % n], 0];
    }
    const azNorm = azDeg < loAz ? azDeg + 360 : azDeg;
    const t = wrapGapDeg > 0 ? (azNorm - loAz) / wrapGapDeg : 0;
    return [order[lo], order[hi % n], t];
  }

  // Real (physical-unit) value at a given radial/gate, or null for no-data / out of range.
  function realValueAt(radialIdx, gateIdx) {
    if (gateIdx < 0 || gateIdx >= gateCount) return null;
    const raw = values[radialIdx * gateCount + gateIdx];
    if (raw === noDataByte) return null;
    return raw * scale + offset;
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
  const metersPerPixel = (2 * maxRangeM) / CANVAS_SIZE;
  const half = CANVAS_SIZE / 2;

  for (let py = 0; py < CANVAS_SIZE; py++) {
    for (let px = 0; px < CANVAS_SIZE; px++) {
      const idx = (py * CANVAS_SIZE + px) * 4;
      const xMeters = (px - half + 0.5) * metersPerPixel;
      const yMeters = (half - py - 0.5) * metersPerPixel;
      const range = Math.hypot(xMeters, yMeters);

      if (range > maxRangeM || range < firstGateM) {
        imageData.data[idx + 3] = 0;
        continue;
      }

      const azDeg = (Math.atan2(xMeters, yMeters) * 180 / Math.PI + 360) % 360;
      const [radialLo, radialHi, azT] = bracketRadials(azDeg);
      const gatePos = (range - firstGateM) / gateSizeM;
      const gateLo = Math.max(0, Math.floor(gatePos));
      const gateHi = Math.min(gateCount - 1, gateLo + 1);
      const gateT = Math.min(1, Math.max(0, gatePos - gateLo));

      const v00 = realValueAt(radialLo, gateLo);
      const v01 = realValueAt(radialLo, gateHi);
      const v10 = realValueAt(radialHi, gateLo);
      const v11 = realValueAt(radialHi, gateHi);

      let real;
      if (v00 == null || v01 == null || v10 == null || v11 == null) {
        // A no-data corner means we're at a real echo edge or scan gap —
        // fall back to nearest-neighbor instead of blending in "no data".
        const nearestRadial = azT < 0.5 ? radialLo : radialHi;
        const nearestGate = gateT < 0.5 ? gateLo : gateHi;
        real = realValueAt(nearestRadial, nearestGate);
      } else {
        const vLo = v00 + (v01 - v00) * gateT;
        const vHi = v10 + (v11 - v10) * gateT;
        real = vLo + (vHi - vLo) * azT;
      }

      if (real == null) {
        imageData.data[idx + 3] = 0;
        continue;
      }

      const rgb = colorForProduct(product, real);
      if (!rgb) {
        imageData.data[idx + 3] = 0;
        continue;
      }

      imageData.data[idx] = rgb[0];
      imageData.data[idx + 1] = rgb[1];
      imageData.data[idx + 2] = rgb[2];
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
