import { useEffect } from 'react';

/**
 * Warms the HTTP cache for frames the Models map is likely to show next.
 *
 * `urls` is in priority order. One queue is shared by every caller: a few
 * requests at a time (so the frame on screen never waits behind a backlog),
 * frames already fetched this session are skipped (they're immutable),
 * and requests no caller wants any more are cancelled.
 *
 * With Save-Data on, or on a slow connection, only the first few are fetched.
 */

const MAX_IN_FLIGHT = 4;
const done = new Set();
const inFlight = new Map(); // url → AbortController
const wanted = new Map(); // caller id → urls
const pinned = new Set(); // one-off warm-ups: never cancelled
let queue = [];
let nextId = 0;

function budget() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : undefined;
  if (!c) return Infinity;
  if (c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g') return 2;
  if (c.effectiveType === '3g') return 8;
  return Infinity;
}

function pump() {
  while (inFlight.size < MAX_IN_FLIGHT && queue.length) {
    const url = queue.shift();
    if (done.has(url) || inFlight.has(url)) continue;
    const controller = new AbortController();
    inFlight.set(url, controller);
    // Same CORS mode as Mapbox's own image fetch, so it hits this cache entry.
    fetch(url, { mode: 'cors', credentials: 'same-origin', signal: controller.signal, priority: 'low' })
      .then((res) => (res.ok ? res.arrayBuffer().then(() => done.add(url)) : undefined))
      .catch(() => {})
      .finally(() => {
        if (inFlight.get(url) === controller) inFlight.delete(url);
        pinned.delete(url);
        pump();
      });
  }
}

function reschedule() {
  const merged = [];
  const seen = new Set();
  // Interleave callers so one long list can't starve another's first frames.
  const lists = [...wanted.values()];
  for (let i = 0; lists.some((l) => i < l.length); i += 1) {
    for (const l of lists) {
      const url = l[i];
      if (url && !seen.has(url)) { seen.add(url); merged.push(url); }
    }
  }
  const pending = merged.filter((u) => !done.has(u)).slice(0, budget());
  const keep = new Set(pending);
  for (const [url, controller] of inFlight) {
    if (!keep.has(url) && !pinned.has(url)) { controller.abort(); inFlight.delete(url); }
  }
  queue = [...[...pinned].filter((u) => !inFlight.has(u)), ...pending.filter((u) => !inFlight.has(u) && !pinned.has(u))];
  pump();
}

/** Frames to warm, most wanted first. */
export function usePreloadFrames(urls) {
  const key = urls.join('|');
  useEffect(() => {
    const id = nextId++;
    wanted.set(id, urls);
    reschedule();
    return () => { wanted.delete(id); reschedule(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** One-off warm-up outside React (the Models tab's hover). Not cancelled. */
export function preloadFrame(url) {
  if (!url || done.has(url) || inFlight.has(url)) return;
  pinned.add(url);
  queue.unshift(url);
  pump();
}

// Tests only.
export function resetPreloadFramesForTest() {
  for (const c of inFlight.values()) c.abort();
  done.clear(); inFlight.clear(); wanted.clear(); pinned.clear(); queue = [];
}
