/**
 * water.mjs
 * Is a point out over open water? Reads the land mask built by
 * scripts/build-land-mask.mjs (land grown by ~5 km, so coasts, lakeshores and
 * islets count as land). Decoded once per warm instance into each row's flip
 * columns; a lookup is a binary search in one row.
 */

import { LAND_MASK_BASE64, LAND_MASK_STEP } from './landMask.mjs';

const ROWS = Math.round(180 / LAND_MASK_STEP);
const COLS = Math.round(360 / LAND_MASK_STEP);

/** Per row: the columns where land/water flips, starting on water. */
const ROW_FLIPS = (() => {
  const bytes = Buffer.from(LAND_MASK_BASE64, 'base64');
  // Copy into an aligned buffer: Buffer.from may hand back a pooled, unaligned slice.
  const words = new Uint16Array(new Uint8Array(bytes).buffer);
  const rows = [];
  for (let i = 0; i < words.length && rows.length < ROWS;) {
    const n = words[i];
    rows.push(words.subarray(i + 1, i + 1 + n));
    i += 1 + n;
  }
  return rows;
})();

/** True when [lon, lat] is over water more than about one mask cell (~5 km) from any land. */
export function isOverOpenWater(lon, lat) {
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / LAND_MASK_STEP)));
  const col = ((Math.floor((lon + 180) / LAND_MASK_STEP) % COLS) + COLS) % COLS;
  const flips = ROW_FLIPS[row];
  if (!flips) return false;
  // How many flips are at or before this column: odd means land.
  let lo = 0;
  let hi = flips.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (flips[mid] <= col) lo = mid + 1;
    else hi = mid;
  }
  return lo % 2 === 0;
}
