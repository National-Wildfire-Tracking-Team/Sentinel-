/**
 * persistence.mjs
 * Finds heat sources by how long they last: a ~2 km square that has had fire
 * detections for more than two months, on at least half the days, is a gas
 * flare, plant or rig, not a wildfire. That catches industrial sites no map
 * lists (new flares, unmapped fields). The kanari-history scheduled function
 * records each day's clusters with updateHistory(); kanari-fires drops
 * clusters in the squares persistentCells() returns.
 *
 * Stored in the site-wide Netlify Blobs store HISTORY_STORE. Only the
 * scheduled function writes it (once a day, published deploy only), so there
 * is a single writer.
 */

export const HISTORY_STORE = 'kanari-fire-history';
export const HISTORY_KEY = 'cells-v1';
export const PERSISTENT_KEY = 'persistent-v1';

// ~2.2 km: wider than one VIIRS pixel, so a flare's daily clusters land in
// the same square even when the centroid shifts a little.
export const CELL_DEG = 0.02;

/** Seen across at least this many days… */
export const MIN_SPAN_DAYS = 60;
/** …and on at least this many of them (a field burned twice isn't a flare). */
export const MIN_DAYS_SEEN = 30;
/** A square that isn't persistent yet is forgotten after this long quiet. */
const FORGET_AFTER_DAYS = 14;
/** A persistent square quiet this long (site shut down) stops being masked. */
const RETIRE_AFTER_DAYS = 30;

export const dayNumber = (ms = Date.now()) => Math.floor(ms / 86_400_000);

export function cellKeyOf(lat, lon) {
  return `${Math.floor(lat / CELL_DEG)}:${Math.floor(lon / CELL_DEG)}`;
}

/** The keys of the square around a point and its eight neighbours. */
export function neighbourKeysOf(lat, lon) {
  const row = Math.floor(lat / CELL_DEG);
  const col = Math.floor(lon / CELL_DEG);
  const keys = [];
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) keys.push(`${r}:${c}`);
  }
  return keys;
}

const isPersistent = ([firstDay, lastDay, daysSeen]) =>
  lastDay - firstDay >= MIN_SPAN_DAYS && daysSeen >= MIN_DAYS_SEEN;

/**
 * Record one day's clusters. history.cells maps a square to
 * [firstDay, lastDay, daysSeen]; each square counts once per day.
 * @param {{ cells?: object }} history  previous history (or empty)
 * @param {Array<[number, number]>} points  [lat, lon] of the day's clusters
 * @param {number} today  dayNumber()
 */
export function updateHistory(history, points, today) {
  const cells = { ...(history?.cells || {}) };
  for (const [lat, lon] of points) {
    const key = cellKeyOf(lat, lon);
    const cell = cells[key];
    if (!cell) cells[key] = [today, today, 1];
    else if (cell[1] !== today) cells[key] = [cell[0], today, cell[2] + 1];
  }
  for (const [key, cell] of Object.entries(cells)) {
    const quiet = today - cell[1];
    if (quiet > (isPersistent(cell) ? RETIRE_AFTER_DAYS : FORGET_AFTER_DAYS)) delete cells[key];
  }
  return { updatedDay: today, cells };
}

/** Squares that count as permanent heat sources. */
export function persistentCells(history) {
  return Object.entries(history?.cells || {})
    .filter(([, cell]) => isPersistent(cell))
    .map(([key]) => key);
}
