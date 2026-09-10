/**
 * mrmsPayloadFormat.js
 * Compact binary format for one decoded NOAA MRMS composite reflectivity
 * frame (a regular geographic grid), shared between the Node ingestion
 * script (scripts/mrms-radar-sync.mjs) and the browser
 * (src/app/utils/mrmsRaster.js) so the encode/decode logic can never drift
 * apart. Uses only ArrayBuffer/DataView/TypedArray — no Node- or
 * browser-specific APIs — so it runs unchanged in both environments.
 *
 * Deliberately its own format, not a variant of nexradPayloadFormat.js: MRMS
 * is a regular lat/lon grid, NEXRAD Level II is polar radials — genuinely
 * different geometry and rendering math, kept fully independent by design.
 *
 * Row 0 of the grid is the NORTHERNMOST row (matches canvas/image
 * convention directly) and rows are spaced evenly in Web Mercator Y, not
 * evenly in degrees latitude — the ingestion script resamples onto that
 * spacing before encoding specifically so a Mapbox `image` source (which
 * warps a rectangular image using only its 4 corner coordinates) places
 * every interior pixel correctly, not just the corners. See
 * scripts/mrms-radar-sync.mjs for the resampling step. `sourceGridSpacingDeg`
 * describes the *source* regrid resolution before that Mercator correction —
 * it is informational only and is not used to place pixels (bounds +
 * Mercator-uniform row spacing is sufficient for that).
 *
 * Layout (little-endian):
 *   Header (64 bytes)
 *     0   4   ASCII    magic "MRM1"
 *     4   1   uint8    format version (1)
 *     5   1   uint8    product: 0 = MergedReflectivityQCComposite
 *     6   2   uint16   reserved (0)
 *     8   8   float64  source_time, epoch milliseconds (from the NOAA filename)
 *    16   8   float64  ingested_at, epoch milliseconds (when Sentinel processed it)
 *    24   4   uint32   grid_width
 *    28   4   uint32   grid_height
 *    32   4   float32  west   (degrees, -180..180)
 *    36   4   float32  east
 *    40   4   float32  south
 *    44   4   float32  north
 *    48   4   float32  source_grid_spacing_deg (informational, see above)
 *    52   4   float32  scale   (dequant: real = raw * scale + offset)
 *    56   4   float32  offset
 *    60   1   uint8    no_data_byte (255)
 *    61   3   uint8    reserved (0)
 *   Values: grid_width x grid_height x uint8, row-major, row 0 = north,
 *           column 0 = west. 255 = no data (no coverage or below threshold —
 *           NEVER a real 0 dBZ value).
 */

const MAGIC = 'MRM1';
const HEADER_BYTES = 64;
const NO_DATA_BYTE = 255;
const MAX_LEVEL = 254; // 0..254 used for real values, 255 reserved for no-data

export const PRODUCT_CODES = { MergedReflectivityQCComposite: 0 };
export const PRODUCT_NAMES = ['MergedReflectivityQCComposite'];

// Physical range used to quantize reflectivity into a single byte. Covers the
// real range observed in production data (-24 to 65 dBZ, confirmed against a
// live file during implementation) with margin on both ends.
export const QUANT_RANGE = { min: -32, max: 95 };

function scaleOffsetFor() {
  const { min, max } = QUANT_RANGE;
  const scale = (max - min) / MAX_LEVEL;
  return { scale, offset: min };
}

/**
 * @param {object} params
 * @param {'MergedReflectivityQCComposite'} params.product
 * @param {number} params.sourceTimeMs - epoch ms, from the NOAA filename
 * @param {number} params.ingestedAtMs - epoch ms, when Sentinel processed it
 * @param {number} params.gridWidth
 * @param {number} params.gridHeight
 * @param {number} params.west - degrees, -180..180
 * @param {number} params.east
 * @param {number} params.south
 * @param {number} params.north
 * @param {number} params.sourceGridSpacingDeg
 * @param {Float32Array|number[]} params.values - length gridWidth*gridHeight, row 0 = north, real dBZ or null/NaN = no data
 * @returns {ArrayBuffer}
 */
export function encodeMrmsPayload({
  product,
  sourceTimeMs,
  ingestedAtMs,
  gridWidth,
  gridHeight,
  west,
  east,
  south,
  north,
  sourceGridSpacingDeg,
  values,
}) {
  const { scale, offset } = scaleOffsetFor();
  const { min, max } = QUANT_RANGE;
  const n = gridWidth * gridHeight;

  const buffer = new ArrayBuffer(HEADER_BYTES + n);
  const view = new DataView(buffer);

  for (let i = 0; i < 4; i++) view.setUint8(i, MAGIC.charCodeAt(i));
  view.setUint8(4, 1); // version
  view.setUint8(5, PRODUCT_CODES[product]);
  view.setUint16(6, 0, true);
  view.setFloat64(8, sourceTimeMs, true);
  view.setFloat64(16, ingestedAtMs, true);
  view.setUint32(24, gridWidth, true);
  view.setUint32(28, gridHeight, true);
  view.setFloat32(32, west, true);
  view.setFloat32(36, east, true);
  view.setFloat32(40, south, true);
  view.setFloat32(44, north, true);
  view.setFloat32(48, sourceGridSpacingDeg, true);
  view.setFloat32(52, scale, true);
  view.setFloat32(56, offset, true);
  view.setUint8(60, NO_DATA_BYTE);
  view.setUint8(61, 0);
  view.setUint8(62, 0);
  view.setUint8(63, 0);

  const bytes = new Uint8Array(buffer, HEADER_BYTES);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v) || v < min || v > max) {
      bytes[i] = NO_DATA_BYTE;
    } else {
      bytes[i] = Math.min(MAX_LEVEL, Math.max(0, Math.round((v - offset) / scale)));
    }
  }

  return buffer;
}

/**
 * Decode a payload produced by encodeMrmsPayload.
 * @param {ArrayBuffer} buffer
 */
export function decodeMrmsPayload(buffer) {
  const view = new DataView(buffer);

  let magic = '';
  for (let i = 0; i < 4; i++) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== MAGIC) throw new Error(`Invalid MRMS payload magic: ${magic}`);

  const version = view.getUint8(4);
  const productCode = view.getUint8(5);
  const sourceTimeMs = view.getFloat64(8, true);
  const ingestedAtMs = view.getFloat64(16, true);
  const gridWidth = view.getUint32(24, true);
  const gridHeight = view.getUint32(28, true);
  const west = view.getFloat32(32, true);
  const east = view.getFloat32(36, true);
  const south = view.getFloat32(40, true);
  const north = view.getFloat32(44, true);
  const sourceGridSpacingDeg = view.getFloat32(48, true);
  const scale = view.getFloat32(52, true);
  const offset = view.getFloat32(56, true);
  const noDataByte = view.getUint8(60);

  const values = new Uint8Array(buffer, HEADER_BYTES, gridWidth * gridHeight);

  return {
    version,
    product: PRODUCT_NAMES[productCode] ?? 'unknown',
    sourceTime: new Date(sourceTimeMs),
    ingestedAt: new Date(ingestedAtMs),
    gridWidth,
    gridHeight,
    west,
    east,
    south,
    north,
    sourceGridSpacingDeg,
    scale,
    offset,
    values,
    noDataByte,
  };
}
