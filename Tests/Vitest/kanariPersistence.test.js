import { describe, it, expect, vi } from 'vitest';
import {
  CELL_DEG, MIN_DAYS_SEEN, MIN_SPAN_DAYS, PERSISTENT_KEY, HISTORY_KEY,
  cellKeyOf, persistentCells, updateHistory,
} from '../../netlify/functions/kanari-fires/persistence.mjs';
import { recordDay } from '../../netlify/functions/kanari-history/kanari-history.mjs';
import { fetchGlobalFires } from '../../netlify/functions/kanari-fires/kanari-fires.mjs';

// An empty spot in the Libyan desert (on no industrial list, so only the
// 2-month rule can catch it), and one in southern Africa.
const FLARE = [22.5, 18.5];
const FIELD = [-15.1, 27.4];

/** Replays `days` days, the point seen on the days `seenOn(day)` allows. */
function replay(point, days, seenOn = () => true) {
  let history = null;
  for (let day = 0; day < days; day++) {
    history = updateHistory(history, seenOn(day) ? [point] : [], 20000 + day);
  }
  return history;
}

describe('2-month rule (persistence.mjs)', () => {
  it('flags a square seen nearly every day for over two months', () => {
    const history = replay(FLARE, MIN_SPAN_DAYS + 5);
    expect(persistentCells(history)).toEqual([cellKeyOf(...FLARE)]);
  });

  it('does not flag it before two months have passed', () => {
    expect(persistentCells(replay(FLARE, MIN_SPAN_DAYS))).toEqual([]);
  });

  it('does not flag a field burned now and then over the same span', () => {
    // Seen every 3rd day for 70 days: ~24 days, under MIN_DAYS_SEEN.
    const history = replay(FIELD, 70, (day) => day % 3 === 0);
    expect(history.cells[cellKeyOf(...FIELD)][2]).toBeLessThan(MIN_DAYS_SEEN);
    expect(persistentCells(history)).toEqual([]);
  });

  it('counts a square once per day, however many clusters it has', () => {
    const history = updateHistory(null, [FLARE, FLARE, FLARE], 20000);
    expect(history.cells[cellKeyOf(...FLARE)]).toEqual([20000, 20000, 1]);
  });

  it('forgets a quiet square that never became persistent', () => {
    let history = updateHistory(null, [FIELD], 20000);
    history = updateHistory(history, [], 20000 + 15);
    expect(history.cells).toEqual({});
  });

  it('stops masking a persistent square once it has been quiet 30+ days', () => {
    let history = replay(FLARE, MIN_SPAN_DAYS + 5);
    const last = history.updatedDay;
    history = updateHistory(history, [], last + 20);
    expect(persistentCells(history)).toHaveLength(1);
    history = updateHistory(history, [], last + 31);
    expect(persistentCells(history)).toEqual([]);
  });

  it('uses ~2 km squares', () => {
    expect(CELL_DEG).toBeCloseTo(0.02);
  });
});

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: vi.fn(async (key) => data[key] ?? null),
    setJSON: vi.fn(async (key, value) => { data[key] = value; }),
  };
}

const kanari = (points) => vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ events: points.map(([lat, lon], i) => ({ id: `e${i}`, centroid: [lon, lat], viirsCount: 1 })) }),
}));

describe('kanari-history recordDay', () => {
  it('records the day and writes the persistent list', async () => {
    const store = memoryStore();
    const result = await recordDay({ store, fetchImpl: kanari([FLARE]), today: 20000 });
    expect(result).toEqual({ squares: 1, persistent: 0 });
    expect(store.data[HISTORY_KEY].cells[cellKeyOf(...FLARE)]).toEqual([20000, 20000, 1]);
    expect(store.data[PERSISTENT_KEY]).toEqual([]);
  });

  it('leaves US clusters out', async () => {
    const store = memoryStore();
    await recordDay({ store, fetchImpl: kanari([[34.05, -118.24]]), today: 20000 });
    expect(store.data[HISTORY_KEY].cells).toEqual({});
  });

  it('skips a second run on the same day without calling Kanari', async () => {
    const store = memoryStore({ [HISTORY_KEY]: { updatedDay: 20000, cells: {} } });
    const fetchImpl = kanari([FLARE]);
    expect(await recordDay({ store, fetchImpl, today: 20000 })).toEqual({ skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.setJSON).not.toHaveBeenCalled();
  });
});

describe('kanari-fires with persistent squares', () => {
  it('drops clusters in a 2-month square and counts them', async () => {
    const persistentCells = new Set([cellKeyOf(...FLARE)]);
    const body = await fetchGlobalFires({ fetchImpl: kanari([FLARE, FIELD]), persistentCells });
    expect(body.fires).toHaveLength(1);
    expect(body.meta.longBurningDropped).toBe(1);
  });

  it('lets a geostationary-only cluster one square off still match', async () => {
    const [lat, lon] = FLARE;
    const persistentCells = new Set([cellKeyOf(lat, lon)]);
    const offByOne = [lat + CELL_DEG, lon];
    const geoOnly = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [{ id: 'g', centroid: [offByOne[1], offByOne[0]], viirsCount: 0, goesCount: 0, mtgCount: 3 }] }),
    }));
    expect((await fetchGlobalFires({ fetchImpl: geoOnly, persistentCells })).fires).toHaveLength(0);
    expect((await fetchGlobalFires({ fetchImpl: kanari([offByOne]), persistentCells })).fires).toHaveLength(1);
  });
});
