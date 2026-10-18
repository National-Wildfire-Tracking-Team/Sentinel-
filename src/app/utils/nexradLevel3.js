/**
 * nexradLevel3.js
 * Decoder for the NEXRAD Level 3 digital radial products used by the Radar
 * Site layer (NOAA/NWS ICD 2620001). WSR-88D: base reflectivity (N0B, 153),
 * base velocity (N0G, 154), differential reflectivity (N0X, 159) and
 * correlation coefficient (N0C, 161). TDWR: base reflectivity (TZ0, 180)
 * and base velocity (TV0, 182). All carry a bzip2-compressed symbology block
 * holding one Digital Radial Data Array packet (code 16): one byte per range
 * gate per radial.
 *
 * Data levels: 0 = below threshold, 1 = range folded, 2..255 map linearly
 * to the product's value (dBZ, m/s, dB or unitless CC). Reflectivity and
 * velocity give it as (minimum, increment) ×10 threshold halfwords; the
 * dual-pol products as float scale and offset: value = (level − offset) / scale.
 */

import { bunzip2 } from './bzip2';

/** Range-gate size (km) per supported product code */
const GATE_KM = { 153: 0.25, 154: 0.25, 159: 0.25, 161: 0.25, 180: 0.15, 182: 0.15 };
/** Dual-pol products: threshold halfwords 31–34 hold float scale and offset. */
const SCALE_OFFSET = new Set([159, 161]);

// Offsets from the start of the message header (ICD Figure 3-6)
const MSG_HEADER_BYTES = 18;
const PDB_BYTES = 102;
const OFF = {
  lat: 20, lon: 24, height: 28, productCode: 30, vcp: 34,
  volDate: 40, volTime: 42, elevAngle: 58,
  thresholdMin: 60, thresholdInc: 62, thresholdLevels: 64,
  compression: 100, uncompressedSize: 102, symbologyOffset: 108,
};

/** Find the message header after the WMO/AWIPS text header (starts with the 2-byte product code). */
function findMessageStart(bytes) {
  // WMO header lines end in \r\r\n; the binary message follows the second one.
  let lines = 0;
  for (let i = 0; i < Math.min(bytes.length - 2, 64); i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0d && bytes[i + 2] === 0x0a) {
      lines += 1;
      i += 2;
      if (lines === 2) return i + 1;
    }
  }
  return 0; // no text header
}

/** Julian day (1 = 1 Jan 1970) + seconds after midnight → ms since epoch. */
function nexradTime(julianDay, seconds) {
  return Date.UTC(1970, 0, 1) + (julianDay - 1) * 86400000 + seconds * 1000;
}

/**
 * Parse a Level 3 N0B / N0G / N0X / N0C / TZ0 / TV0 product.
 * @param {ArrayBuffer|Uint8Array} input  raw file bytes
 * @returns {{
 *   productCode: number, lat: number, lon: number, heightFt: number, vcp: number,
 *   elevation: number, time: number,
 *   gateKm: number, firstGate: number, gates: number,
 *   radials: { start: number, width: number, data: Uint8Array }[],
 *   valueMin: number, valueInc: number,  value at level 2, value per level
 * }}
 */
export function parseLevel3(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const m = findMessageStart(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset + m, bytes.length - m);

  const productCode = view.getInt16(OFF.productCode);
  const gateKm = GATE_KM[productCode];
  if (!gateKm) throw new Error(`Unsupported Level 3 product code ${productCode}`);
  if (view.getInt16(MSG_HEADER_BYTES) !== -1) throw new Error('Level 3: missing product description block');

  const header = {
    productCode,
    lat: view.getInt32(OFF.lat) / 1000,
    lon: view.getInt32(OFF.lon) / 1000,
    heightFt: view.getInt16(OFF.height),
    vcp: view.getInt16(OFF.vcp),
    elevation: view.getInt16(OFF.elevAngle) / 10,
    time: nexradTime(view.getInt16(OFF.volDate), view.getInt32(OFF.volTime)),
    gateKm,
  };
  if (SCALE_OFFSET.has(productCode)) {
    const scale = view.getFloat32(OFF.thresholdMin);
    const offset = view.getFloat32(OFF.thresholdMin + 4);
    header.valueMin = (2 - offset) / scale;
    header.valueInc = 1 / scale;
  } else {
    header.valueMin = view.getInt16(OFF.thresholdMin) / 10;
    header.valueInc = view.getInt16(OFF.thresholdInc) / 10;
  }

  // Symbology block: bzip2-compressed (p8 = 1) or raw, starting right after the PDB.
  const compressed = view.getInt16(OFF.compression) === 1;
  const symStart = m + MSG_HEADER_BYTES + PDB_BYTES;
  let sym;
  if (compressed) {
    sym = bunzip2(bytes.subarray(symStart));
  } else {
    const offHalfwords = view.getInt32(OFF.symbologyOffset);
    if (!offHalfwords) throw new Error('Level 3: no symbology block');
    sym = bytes.subarray(m + offHalfwords * 2);
  }
  const sv = new DataView(sym.buffer, sym.byteOffset, sym.byteLength);

  // Symbology header: divider, block id, length(4), layers, layer divider, layer length(4)
  if (sv.getInt16(0) !== -1 || sv.getInt16(2) !== 1) throw new Error('Level 3: bad symbology block');
  let p = 16;
  const packetCode = sv.getUint16(p);
  if (packetCode !== 16) throw new Error(`Level 3: unsupported packet code ${packetCode}`);
  const firstGate = sv.getInt16(p + 2);
  const gates = sv.getInt16(p + 4);
  const nRadials = sv.getInt16(p + 12);
  p += 14;

  const radials = new Array(nRadials);
  for (let r = 0; r < nRadials; r++) {
    const len = sv.getInt16(p);
    const start = sv.getInt16(p + 2) / 10;
    const width = sv.getInt16(p + 4) / 10;
    p += 6;
    radials[r] = { start, width, data: sym.subarray(p, p + Math.min(len, gates)) };
    p += len + (len % 2); // radials are padded to a halfword
  }

  return { ...header, firstGate, gates, radials };
}

/** Product value (dBZ, m/s, dB, CC) for a data level (null for below-threshold / range-folded). */
export function levelToValue(level, scan) {
  if (level < 2) return null;
  return scan.valueMin + (level - 2) * scan.valueInc;
}
