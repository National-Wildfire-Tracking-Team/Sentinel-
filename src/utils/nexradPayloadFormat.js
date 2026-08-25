/**
 * nexradPayloadFormat.js
 * Compact binary format for one decoded NEXRAD Level II scan (one site,
 * one product, one elevation), shared between the Node ingestion script
 * (scripts/nexrad-radar-sync.mjs) and the browser (src/utils/radarRaster.js)
 * so the encode/decode logic can never drift apart. Uses only ArrayBuffer/
 * DataView/TypedArray — no Node- or browser-specific APIs — so it runs
 * unchanged in both environments.
 *
 * Layout (little-endian):
 *   Header (44 bytes)
 *     0   4   ASCII    magic "NXR1"
 *     4   1   uint8    format version (1)
 *     5   1   uint8    product: 0 = reflectivity, 1 = velocity
 *     6   2   uint16   reserved (0)
 *     8   4   ASCII    site_id (4-letter ICAO code)
 *    12   8   float64  scan_time, epoch milliseconds
 *    20   4   float32  elevation_deg
 *    24   2   uint16   radial_count
 *    26   2   uint16   gate_count
 *    28   4   float32  gate_size_m
 *    32   4   float32  first_gate_m
 *    36   4   float32  scale   (dequant: real = raw * scale + offset)
 *    40   4   float32  offset
 *   Azimuths:  radial_count x float32 (degrees, 0-360)
 *   Moments:   radial_count x gate_count x uint8, row-major [radial][gate]
 *              255 = no data / below threshold
 */

const MAGIC = 'NXR1';
const HEADER_BYTES = 44;
const NO_DATA_BYTE = 255;
const MAX_LEVEL = 254; // 0..254 used for real values, 255 reserved for no-data

export const PRODUCT_CODES = { reflectivity: 0, velocity: 1 };
export const PRODUCT_NAMES = ['reflectivity', 'velocity'];

// Physical ranges used to quantize each product into a single byte.
export const QUANT_RANGE = {
  reflectivity: { min: -32, max: 95 }, // dBZ
  velocity: { min: -100, max: 100 },   // knots
};

function scaleOffsetFor(product) {
  const { min, max } = QUANT_RANGE[product];
  const scale = (max - min) / MAX_LEVEL;
  return { scale, offset: min };
}

/**
 * Encode one decoded scan into a compact ArrayBuffer.
 * @param {object} params
 * @param {string} params.siteId - 4-letter ICAO code, e.g. "KTLX"
 * @param {'reflectivity'|'velocity'} params.product
 * @param {number} params.scanTimeMs - epoch ms
 * @param {number} params.elevationDeg
 * @param {number[]|Float32Array} params.azimuths - length radialCount, degrees
 * @param {number} params.gateCount
 * @param {(number[]|Float32Array)[]} params.moments - length radialCount, each length gateCount, physical units (dBZ/kt), NaN/null = no data
 * @returns {ArrayBuffer}
 */
export function encodeScanPayload({
  siteId,
  product,
  scanTimeMs,
  elevationDeg,
  azimuths,
  gateCount,
  gateSizeM,
  firstGateM,
  moments,
}) {
  const radialCount = azimuths.length;
  const { scale, offset } = scaleOffsetFor(product);
  const { min, max } = QUANT_RANGE[product];

  const buffer = new ArrayBuffer(HEADER_BYTES + radialCount * 4 + radialCount * gateCount);
  const view = new DataView(buffer);

  for (let i = 0; i < 4; i++) view.setUint8(i, MAGIC.charCodeAt(i));
  view.setUint8(4, 1); // version
  view.setUint8(5, PRODUCT_CODES[product]);
  view.setUint16(6, 0, true);
  const siteBytes = String(siteId).toUpperCase().padEnd(4, '\0').slice(0, 4);
  for (let i = 0; i < 4; i++) view.setUint8(8 + i, siteBytes.charCodeAt(i));
  view.setFloat64(12, scanTimeMs, true);
  view.setFloat32(20, elevationDeg, true);
  view.setUint16(24, radialCount, true);
  view.setUint16(26, gateCount, true);
  view.setFloat32(28, gateSizeM, true);
  view.setFloat32(32, firstGateM, true);
  view.setFloat32(36, scale, true);
  view.setFloat32(40, offset, true);

  let cursor = HEADER_BYTES;
  for (let r = 0; r < radialCount; r++) {
    view.setFloat32(cursor, azimuths[r], true);
    cursor += 4;
  }

  const bytes = new Uint8Array(buffer, cursor);
  let bIdx = 0;
  for (let r = 0; r < radialCount; r++) {
    const row = moments[r] || [];
    for (let g = 0; g < gateCount; g++) {
      const v = row[g];
      if (v == null || !Number.isFinite(v) || v < min || v > max) {
        bytes[bIdx++] = NO_DATA_BYTE;
      } else {
        bytes[bIdx++] = Math.min(MAX_LEVEL, Math.max(0, Math.round((v - offset) / scale)));
      }
    }
  }

  return buffer;
}

/**
 * Decode a payload produced by encodeScanPayload.
 * @param {ArrayBuffer} buffer
 */
export function decodeScanPayload(buffer) {
  const view = new DataView(buffer);

  let magic = '';
  for (let i = 0; i < 4; i++) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== MAGIC) throw new Error(`Invalid NEXRAD scan payload magic: ${magic}`);

  const version = view.getUint8(4);
  const productCode = view.getUint8(5);
  let siteId = '';
  for (let i = 0; i < 4; i++) {
    const c = view.getUint8(8 + i);
    if (c) siteId += String.fromCharCode(c);
  }
  const scanTimeMs = view.getFloat64(12, true);
  const elevationDeg = view.getFloat32(20, true);
  const radialCount = view.getUint16(24, true);
  const gateCount = view.getUint16(26, true);
  const gateSizeM = view.getFloat32(28, true);
  const firstGateM = view.getFloat32(32, true);
  const scale = view.getFloat32(36, true);
  const offset = view.getFloat32(40, true);

  let cursor = HEADER_BYTES;
  const azimuths = new Float32Array(radialCount);
  for (let r = 0; r < radialCount; r++) {
    azimuths[r] = view.getFloat32(cursor, true);
    cursor += 4;
  }

  const values = new Uint8Array(buffer, cursor, radialCount * gateCount);

  return {
    version,
    siteId,
    product: PRODUCT_NAMES[productCode] ?? 'unknown',
    scanTime: new Date(scanTimeMs),
    elevationDeg,
    radialCount,
    gateCount,
    gateSizeM,
    firstGateM,
    scale,
    offset,
    azimuths,
    values,
    noDataByte: NO_DATA_BYTE,
  };
}
