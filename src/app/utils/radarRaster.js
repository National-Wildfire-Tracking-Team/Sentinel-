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
      const radialIdx = nearestRadialIndex(azDeg);
      const gateIdx = Math.min(gateCount - 1, Math.max(0, Math.floor((range - firstGateM) / gateSizeM)));
      const raw = values[radialIdx * gateCount + gateIdx];

      if (raw === noDataByte) {
        imageData.data[idx + 3] = 0;
        continue;
      }

      const real = raw * scale + offset;
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
