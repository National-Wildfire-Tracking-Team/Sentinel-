/**
 * Netlify scheduled function – daily fire history for the 2-month rule.
 *
 * Once a day it fetches Kanari's last 24 h of clusters (one extra request a
 * day, well inside Kanari's polling guidance) and records which ~2 km squares
 * outside the US had fire. Squares that keep burning for more than two months
 * are written to the persistent list kanari-fires drops (see
 * ../kanari-fires/persistence.mjs). Scheduled functions only run on the
 * published deploy, so previews never write this store.
 */

import { getStore } from '@netlify/blobs';
import { fetchKanariEvents, hasCentroid } from '../kanari-fires/kanariApi.mjs';
import { isInUnitedStates } from '../kanari-fires/usBorder.mjs';
import {
  HISTORY_KEY, HISTORY_STORE, PERSISTENT_KEY, dayNumber, persistentCells, updateHistory,
} from '../kanari-fires/persistence.mjs';

/** One day's update; the store and fetch are injectable for tests. */
export async function recordDay({ store = getStore({ name: HISTORY_STORE, consistency: 'strong' }), fetchImpl = fetch, today = dayNumber() } = {}) {
  const previous = await store.get(HISTORY_KEY, { type: 'json' });
  // Already recorded today (a manual "Run now"): don't spend a Kanari request.
  if (previous?.updatedDay === today) return { skipped: true };

  const { events } = await fetchKanariEvents(fetchImpl);
  const points = events
    .filter(hasCentroid)
    .filter((e) => !isInUnitedStates(e.centroid))
    .map((e) => [e.centroid[1], e.centroid[0]]);

  const history = updateHistory(previous, points, today);
  const persistent = persistentCells(history);
  await store.setJSON(HISTORY_KEY, history);
  await store.setJSON(PERSISTENT_KEY, persistent);
  return { squares: Object.keys(history.cells).length, persistent: persistent.length };
}

export default async () => {
  const result = await recordDay();
  console.log('[kanari-history]', JSON.stringify(result));
};

// 06:17 UTC daily: off the hour, so it doesn't land with everyone else's crons.
export const config = { schedule: '17 6 * * *' };
