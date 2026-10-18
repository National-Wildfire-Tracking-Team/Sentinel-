/**
 * radarSweep.js
 * Packs one decoded Level 3 radial scan (nexradLevel3.js) into the compact
 * GPU form drawn by radarSweepLayer.js: one byte per gate per radial, an
 * azimuth → radial lookup, and a data level → colour palette (picked by the
 * scan's product: reflectivity, velocity, correlation coefficient or ZDR). The GPU then
 * resolves each map pixel to (azimuth, ground range) from the radar, so every
 * gate draws as a true polar cell — an arc segment of a ring around the
 * station, its sides along the beam — rather than a north-up pixel.
 */

import { levelToValue, parseLevel3 } from './nexradLevel3';

/** NWS base reflectivity scale: [dBZ, hex]; each colour holds until the next step. */
export const REFLECTIVITY_SCALE = [
  [5, '#04e9e7'],
  [10, '#019ff4'],
  [15, '#0300f4'],
  [20, '#02fd02'],
  [25, '#01c501'],
  [30, '#008e00'],
  [35, '#fdf802'],
  [40, '#e5bc00'],
  [45, '#fd9500'],
  [50, '#fd0000'],
  [55, '#d40000'],
  [60, '#bc0000'],
  [65, '#f800fd'],
  [70, '#9854c6'],
  [75, '#fdfdfd'],
];

/** "Reflectivity Gates" L/H handles: 0 … 70 (70 reads "70+"), move by 1 and snap to the nearest 10 within SNAP_DBZ. */
export const DBZ_MAX = 70;
const SNAP_DBZ = 2;
export function snapDbz(value) {
  const v = Math.min(DBZ_MAX, Math.max(0, Math.round(Number(value) || 0)));
  const ten = Math.round(v / 10) * 10;
  return Math.abs(v - ten) <= SNAP_DBZ ? ten : v;
}

const EARTH_KM = 6371.0088;
const DEG = Math.PI / 180;
export const AZ_STEPS = 3600; // 0.1° azimuth lookup

/** Base velocity, m/s (negative = toward the radar): greens inbound, reds outbound, gray near zero. Blended between stops. */
export const VELOCITY_SCALE = [
  [-40, '#b4ffb4'],
  [-30, '#00ff00'],
  [-18, '#00bb00'],
  [-8, '#006e00'],
  [-1, '#3c4d3c'],
  [1, '#4d3c3c'],
  [8, '#6e0000'],
  [18, '#bb0000'],
  [30, '#ff0000'],
  [40, '#ffb4b4'],
];
const RANGE_FOLDED = '#7d2fbf';

/** Correlation coefficient (unitless): low (debris, non-weather) cool, ~1 (pure rain/snow) warm. Blended between stops. */
export const CC_SCALE = [
  [0.2, '#0c0c4a'],
  [0.45, '#1e2ad2'],
  [0.65, '#2f9ed6'],
  [0.75, '#2bc46a'],
  [0.85, '#c8d200'],
  [0.9, '#ffa000'],
  [0.95, '#ff2a00'],
  [0.98, '#b40000'],
  [1.0, '#ff8cf0'],
  [1.05, '#ffffff'],
];

/** Differential reflectivity, dB. Blended between stops. */
export const ZDR_SCALE = [
  [-4, '#303030'],
  [-1, '#8c8c8c'],
  [0, '#d2d2d2'],
  [0.5, '#2828a8'],
  [1, '#3c8cff'],
  [1.5, '#00c8c8'],
  [2, '#00c000'],
  [2.5, '#f0f000'],
  [3, '#ff9600'],
  [4, '#ff0000'],
  [5, '#b40050'],
  [6, '#ff9cff'],
  [8, '#ffffff'],
];

/** Product code → how its values are coloured. */
const PRODUCT_COLORS = {
  153: { scale: REFLECTIVITY_SCALE, stepped: true },
  180: { scale: REFLECTIVITY_SCALE, stepped: true },
  154: { scale: VELOCITY_SCALE, rangeFolded: RANGE_FOLDED },
  182: { scale: VELOCITY_SCALE, rangeFolded: RANGE_FOLDED },
  161: { scale: CC_SCALE },
  159: { scale: ZDR_SCALE },
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour of a value: stepped (each colour holds until the next stop; none below the first) or blended (clamped at the ends). */
function colorAt(stops, value, stepped) {
  if (stepped) {
    let c = null;
    for (const [threshold, color] of stops) if (value >= threshold) c = color;
    return c;
  }
  if (value <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i];
    if (value <= v1) {
      const [v0, c0] = stops[i - 1];
      const t = (value - v0) / (v1 - v0);
      return c0.map((x, k) => Math.round(x + (c1[k] - x) * t));
    }
  }
  return stops[stops.length - 1][1];
}

/** 256 × RGBA bytes: data level → colour (transparent for no data, and below 5 dBZ on reflectivity). */
export function levelPalette(scan) {
  const out = new Uint8Array(256 * 4);
  const spec = PRODUCT_COLORS[scan.productCode] ?? PRODUCT_COLORS[153];
  const rgb = spec.scale.map(([v, hex]) => [v, hexToRgb(hex)]);
  if (spec.rangeFolded) out.set([...hexToRgb(spec.rangeFolded), 255], 4);
  for (let level = 2; level < 256; level++) {
    const c = colorAt(rgb, levelToValue(level, scan), spec.stepped);
    if (c) out.set([c[0], c[1], c[2], 255], level * 4);
  }
  return out;
}

/** Azimuth bucket (0.1°) → radial index + 1 (0 where no radial covers it). */
export function azimuthIndex(radials) {
  const idx = new Uint16Array(AZ_STEPS);
  radials.forEach((r, i) => {
    const from = Math.round(r.start * 10);
    const steps = Math.max(1, Math.round(r.width * 10));
    for (let k = 0; k < steps; k++) idx[(((from + k) % AZ_STEPS) + AZ_STEPS) % AZ_STEPS] = i + 1;
  });
  return idx;
}

/**
 * Bounding box (degrees) of the scan's coverage circle on the sphere.
 * @returns {{ west: number, east: number, north: number, south: number }}
 */
export function scanBounds(scan) {
  const d = ((scan.firstGate + scan.gates) * scan.gateKm) / EARTH_KM; // angular range
  const lat0 = scan.lat * DEG;
  const dLat = d / DEG;
  // Widest longitude reached by a circle of angular radius d around lat0
  const s = Math.sin(d) / Math.cos(lat0);
  const dLon = (s >= 1 ? Math.PI : Math.asin(s)) / DEG;
  return { west: scan.lon - dLon, east: scan.lon + dLon, north: scan.lat + dLat, south: scan.lat - dLat };
}

/**
 * Scan → GPU sweep.
 * @param {ReturnType<typeof parseLevel3>} scan
 * @returns {{ lat: number, lon: number, gateKm: number, firstGate: number, gates: number,
 *   radialCount: number, data: Uint8Array, azIndex: Uint16Array, palette: Uint8Array,
 *   valueMin: number, valueInc: number, bounds: ReturnType<typeof scanBounds> }}
 */
export function buildSweep(scan) {
  const { radials, gates } = scan;
  const data = new Uint8Array(radials.length * gates);
  radials.forEach((r, i) => data.set(r.data.subarray(0, gates), i * gates));
  return {
    lat: scan.lat,
    lon: scan.lon,
    gateKm: scan.gateKm,
    firstGate: scan.firstGate,
    gates,
    radialCount: radials.length,
    data,
    azIndex: azimuthIndex(radials),
    palette: levelPalette(scan),
    valueMin: scan.valueMin, // level → value, for the "Reflectivity Gates" filter
    valueInc: scan.valueInc,
    bounds: scanBounds(scan),
  };
}

/**
 * Level 3 bytes → scan header fields + GPU sweep.
 * @returns {{ scan: object, sweep: ReturnType<typeof buildSweep> }}
 */
export function decodeSweep(buffer) {
  const scan = parseLevel3(buffer);
  const sweep = buildSweep(scan);
  // Radials stay behind: only header fields cross back to the page.
  const { radials, ...meta } = scan;
  return { scan: { ...meta, radialCount: radials.length }, sweep };
}
