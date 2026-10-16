/**
 * radarSweep.js
 * Packs one decoded Level 3 radial scan (nexradLevel3.js) into the compact
 * GPU form drawn by radarSweepLayer.js: one byte per gate per radial, an
 * azimuth → radial lookup, and a data level → colour palette. The GPU then
 * resolves each map pixel to (azimuth, ground range) from the radar, so every
 * gate draws as a true polar cell — an arc segment of a ring around the
 * station, its sides along the beam — rather than a north-up pixel.
 */

import { parseLevel3 } from './nexradLevel3';

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

const EARTH_KM = 6371.0088;
const DEG = Math.PI / 180;
export const AZ_STEPS = 3600; // 0.1° azimuth lookup

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 256 × RGBA bytes: data level → colour (transparent below 5 dBZ / no data). */
export function levelPalette(scan) {
  const out = new Uint8Array(256 * 4);
  const rgb = REFLECTIVITY_SCALE.map(([dbz, hex]) => [dbz, hexToRgb(hex)]);
  for (let level = 2; level < 256; level++) {
    const dbz = scan.dbzMin + (level - 2) * scan.dbzInc;
    let c = null;
    for (const [threshold, color] of rgb) if (dbz >= threshold) c = color;
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
 *   bounds: ReturnType<typeof scanBounds> }}
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
