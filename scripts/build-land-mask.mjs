/**
 * build-land-mask.mjs
 * Writes netlify/functions/kanari-fires/landMask.mjs: a world land/water grid
 * the kanari-fires function uses to drop "fires" out in open water (oil and
 * gas platforms, ships, flares at sea, glints on big lakes).
 *
 * Source: Natural Earth 1:10m land, minor islands and lakes (public domain).
 * A cell is land when its centre is inside a land polygon (or an island's
 * outline touches it, so islets smaller than a cell still count), and not
 * inside a lake. Land is then grown by one cell in every direction, so fires
 * on a coast, a lakeshore or a small island are always kept; only those well
 * out over water (more than about one cell, ~5 km, from any land) are dropped.
 *
 * Stored per row as the columns where land/water flips (starting on water),
 * as packed uint16 (base64): ~0.5 MB instead of a 26M-cell bitmap, looked up
 * with a binary search per row.
 *
 *   npm run data:land-mask
 *   npm run data:land-mask -- --cache /some/dir   (reuse downloads)
 *
 * The coastline doesn't move; re-run only to change the resolution or margin.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../netlify/functions/kanari-fires/landMask.mjs', import.meta.url));
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const STEP = 0.05; // degrees per cell (~5.5 km)
const COLS = Math.round(360 / STEP);
const ROWS = Math.round(180 / STEP);

const cacheArg = process.argv.indexOf('--cache');
const WORK = cacheArg !== -1 ? process.argv[cacheArg + 1] : join(tmpdir(), 'sentinel-land-mask');

async function geojson(name) {
  const path = join(WORK, `${name}.geojson`);
  if (!existsSync(path)) {
    console.log(`Downloading ${name} …`);
    const res = await fetch(`${NE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    await mkdir(WORK, { recursive: true });
    await writeFile(path, await res.text());
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Every polygon (as its rings) in a FeatureCollection. */
function polygonsOf(fc) {
  const out = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (g?.type === 'Polygon') out.push(g.coordinates);
    else if (g?.type === 'MultiPolygon') out.push(...g.coordinates);
  }
  return out;
}

const grid = new Uint8Array(COLS * ROWS);
const rowOf = (lat) => Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / STEP)));
const colOf = (lon) => ((Math.floor((lon + 180) / STEP) % COLS) + COLS) % COLS;

/** Set (value 1) or clear (0) every cell whose centre is inside the polygon (even-odd, so holes stay out). */
function fill(rings, value) {
  let minLat = Infinity, maxLat = -Infinity;
  for (const ring of rings) for (const [, lat] of ring) { if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; }
  for (let r = rowOf(maxLat); r <= rowOf(minLat); r++) {
    const lat = 90 - (r + 0.5) * STEP;
    const xs = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.ceil((xs[k] + 180) / STEP - 0.5);
      const c1 = Math.floor((xs[k + 1] + 180) / STEP - 0.5);
      for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) grid[r * COLS + c] = value;
    }
  }
}

/** Mark the cell under every vertex: islets narrower than a cell. */
function markOutline(rings) {
  for (const ring of rings) for (const [lon, lat] of ring) grid[rowOf(lat) * COLS + colOf(lon)] = 1;
}

const land = polygonsOf(await geojson('ne_10m_land'));
const islands = polygonsOf(await geojson('ne_10m_minor_islands'));
const lakes = polygonsOf(await geojson('ne_10m_lakes'));
console.log(`land ${land.length}, minor islands ${islands.length}, lakes ${lakes.length} polygons`);

land.forEach((p) => { fill(p, 1); markOutline(p); });
islands.forEach((p) => { fill(p, 1); markOutline(p); });
lakes.forEach((p) => fill(p, 0));

// Grow land by one cell (8-neighbour), wrapping east–west.
const grown = new Uint8Array(grid);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (grid[r * COLS + c]) continue;
    outer: for (let dr = -1; dr <= 1; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= ROWS) continue;
      for (let dc = -1; dc <= 1; dc++) {
        if (grid[rr * COLS + ((c + dc + COLS) % COLS)]) { grown[r * COLS + c] = 1; break outer; }
      }
    }
  }
}

// Per row: [count, ...columns where it flips], starting on water.
const words = [];
let landCells = 0;
for (let r = 0; r < ROWS; r++) {
  const flips = [];
  let state = 0;
  for (let c = 0; c < COLS; c++) {
    const v = grown[r * COLS + c];
    landCells += v;
    if (v !== state) { flips.push(c); state = v; }
  }
  words.push(flips.length, ...flips);
}
const base64 = Buffer.from(new Uint16Array(words).buffer).toString('base64');
await writeFile(OUT, `// Generated by scripts/build-land-mask.mjs — do not edit by hand.
// World land mask at ${STEP}° (${COLS}×${ROWS} cells), land grown by one cell so coasts,
// lakeshores and islets are kept. Natural Earth 1:10m land, minor islands and lakes (public domain).
// Format: base64 of little-endian uint16; per row (north to south): a count, then the
// columns (west to east from 180°W) where it flips, starting on water.
export const LAND_MASK_STEP = ${STEP};
export const LAND_MASK_BASE64 = '${base64}';
`);
console.log(`${(landCells / (COLS * ROWS) * 100).toFixed(1)}% of cells land; ${words.length - ROWS} flips; ${(base64.length / 1024).toFixed(0)} KB → ${OUT}`);
