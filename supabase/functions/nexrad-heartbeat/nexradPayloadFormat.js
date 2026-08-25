/**
 * nexradPayloadFormat.js
 * Deno-side copy of src/utils/nexradPayloadFormat.js — kept byte-for-byte
 * identical since it defines the wire format shared with the browser
 * decoder and the Node ingestion script. Uses only ArrayBuffer/DataView/
 * TypedArray, so it runs unchanged here. If the format ever changes, this
 * copy must be updated to match (see the canonical file for the full
 * layout doc comment).
 */

const MAGIC = 'NXR1';
const HEADER_BYTES = 44;
const NO_DATA_BYTE = 255;
const MAX_LEVEL = 254;

export const PRODUCT_CODES = { reflectivity: 0, velocity: 1 };

export const QUANT_RANGE = {
  reflectivity: { min: -32, max: 95 },
  velocity: { min: -100, max: 100 },
};

function scaleOffsetFor(product) {
  const { min, max } = QUANT_RANGE[product];
  const scale = (max - min) / MAX_LEVEL;
  return { scale, offset: min };
}

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
  view.setUint8(4, 1);
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
