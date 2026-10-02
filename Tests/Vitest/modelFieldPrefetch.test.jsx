/**
 * modelFieldPrefetch.test.jsx
 * What makes the Models tab fast: the manifest kept on the device and shared
 * between callers, the order frames are pre-fetched in, and the queue that
 * fetches them a few at a time.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { loadFieldManifest, readCachedManifest } from '../../src/app/api/modelFields';
import { jumpTargets, prefetchPlan } from '../../src/app/utils/modelFieldSelection';
import { preloadFrame, resetPreloadFramesForTest, usePreloadFrames } from '../../src/app/hooks/usePreloadFrames';

const SERVICE = 'https://d1.cloudfront.net/weather-models';
const BASE = `${SERVICE}/fields/v1`;
const hours = (n, start) => Array.from({ length: n }, (_, i) => new Date(Date.parse(start) + i * 3_600_000).toISOString().replace('.000', ''));

const manifest = {
  schemaVersion: 1,
  kind: 'model-field-manifest',
  models: {
    hrrr: {
      current: { id: 'H', runTime: '2026-10-01T12:00:00Z', hours: [...Array(13).keys()], validTimes: hours(13, '2026-10-01T12:00:00Z') },
      image: { coordinates: [], levels: { lo: [900, 500], hi: [1800, 1000] } },
      wind: { coordinates: [], size: [450, 250], range: 50 },
    },
    gfs: {
      current: { id: 'G', runTime: '2026-10-01T06:00:00Z', hours: [...Array(13).keys()].map((h) => h + 6), validTimes: hours(13, '2026-10-01T12:00:00Z') },
      image: { coordinates: [], levels: { lo: [520, 425] } },
      wind: { coordinates: [], size: [260, 212], range: 50 },
    },
  },
  difference: { id: 'H_G', validTimes: hours(13, '2026-10-01T12:00:00Z'), variables: ['temperature'] },
  variables: {
    temperature: { models: ['hrrr', 'gfs'] },
    windGust: { models: ['hrrr'] },
  },
};
const timeline = manifest.models.hrrr.current.validTimes;
const NOW = Date.parse('2026-10-01T14:20:00Z'); // "Now" = 14Z, index 2
const plan = (over) => prefetchPlan({
  base: BASE, manifest, mode: 'hrrr', compareView: 'swipe', variable: 'temperature', validTime: timeline[5], timeline, nowMs: NOW, ...over,
});
const lo = (m, v, h) => `${BASE}/${m}/${m === 'hrrr' ? 'H' : 'G'}/${v}/lo/${String(h).padStart(3, '0')}.png`;

describe('jumpTargets', () => {
  it('starts at the current hour and keeps only steps the timeline has', () => {
    expect(jumpTargets(timeline, NOW)).toEqual([
      { label: 'Now', i: 2 }, { label: '+1h', i: 3 }, { label: '+3h', i: 5 }, { label: '+6h', i: 8 },
    ]);
  });
});

describe('prefetchPlan', () => {
  it('paused: next steps first, then the frame behind, the jumps, other variables, the other model', () => {
    const urls = plan({ ahead: 2 });
    expect(urls.slice(0, 3)).toEqual([lo('hrrr', 'temperature', 6), lo('hrrr', 'temperature', 7), lo('hrrr', 'temperature', 4)]);
    expect(urls).toContain(lo('hrrr', 'temperature', 2)); // Now
    expect(urls).toContain(lo('hrrr', 'temperature', 8)); // +6h
    expect(urls).toContain(lo('hrrr', 'windGust', 5)); // same moment, other variable
    expect(urls).toContain(lo('gfs', 'temperature', 11)); // same moment, other model (GFS hour 5 + 6)
    expect(urls).not.toContain(lo('hrrr', 'temperature', 5)); // on screen: the map loads it
    expect(urls).not.toContain(lo('hrrr', 'temperature', 12)); // beyond the window without `whole`
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('whole: the rest of the timeline comes last', () => {
    const urls = plan({ ahead: 2, whole: true });
    expect(urls.at(-1)).toBe(lo('hrrr', 'temperature', 0));
    expect(urls).toContain(lo('hrrr', 'temperature', 12));
  });

  it('playing: the whole loop from the playhead, wrapping, and nothing else', () => {
    const urls = plan({ playing: true });
    expect(urls).toHaveLength(timeline.length - 1);
    expect(urls[0]).toBe(lo('hrrr', 'temperature', 6));
    expect(urls.at(-1)).toBe(lo('hrrr', 'temperature', 4));
  });

  it('zoomed in: the 3 km frames come first, including the one on screen', () => {
    const urls = plan({ hiRes: true, shownRes: 'lo' });
    expect(urls.slice(0, 3)).toEqual([5, 6, 4].map((h) => `${BASE}/hrrr/H/temperature/hi/${String(h).padStart(3, '0')}.png`));
  });

  it('wind frames follow when particles are on; difference mode uses difference frames', () => {
    expect(plan({ particles: true, ahead: 1 })).toContain(`${BASE}/hrrr/H/wind/006.png`);
    const diff = plan({ mode: 'compare', compareView: 'difference', ahead: 1 });
    expect(diff[0]).toBe(`${BASE}/diff/H_G/temperature/20261001T1800Z.png`);
    expect(diff.every((u) => u.includes('/diff/'))).toBe(true);
  });

  it('is empty without a manifest or a time on the timeline', () => {
    expect(plan({ manifest: null })).toEqual([]);
    expect(plan({ validTime: '2030-01-01T00:00:00Z' })).toEqual([]);
  });
});

describe('manifest on the device', () => {
  beforeEach(() => { window.localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a fetched manifest is kept, shared between callers, and expires after 6 h', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => manifest }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([loadFieldManifest(SERVICE), loadFieldManifest(SERVICE)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(readCachedManifest(SERVICE)).toEqual(manifest);
    expect(readCachedManifest(SERVICE, Date.now() + 7 * 3_600_000)).toBeNull();
    expect(readCachedManifest('https://other.example/weather-models')).toBeNull();
  });

  it('a corrupt entry is ignored', () => {
    window.localStorage.setItem('sentinel:model-field-manifest:v1', '{not json');
    expect(readCachedManifest(SERVICE)).toBeNull();
  });
});

describe('usePreloadFrames', () => {
  let pending;
  beforeEach(() => {
    resetPreloadFramesForTest();
    pending = [];
    vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      const entry = { url, aborted: false, resolve: () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }) };
      pending.push(entry);
      signal.addEventListener('abort', () => { entry.aborted = true; reject(new Error('aborted')); });
    })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('fetches four at a time, in order, and never refetches a frame', async () => {
    const urls = ['a', 'b', 'c', 'd', 'e', 'f'];
    const { rerender } = renderHook(({ u }) => usePreloadFrames(u), { initialProps: { u: urls } });
    expect(pending.map((p) => p.url)).toEqual(['a', 'b', 'c', 'd']);
    pending[0].resolve();
    await flush();
    expect(pending.map((p) => p.url)).toEqual(['a', 'b', 'c', 'd', 'e']);
    rerender({ u: ['a', 'z'] }); // a is done; b-e are no longer wanted
    await flush();
    expect(pending.filter((p) => p.aborted).map((p) => p.url)).toEqual(['b', 'c', 'd', 'e']);
    expect(pending.map((p) => p.url).slice(5)).toEqual(['z']);
  });

  it('a hover warm-up survives the tab opening with a different list', async () => {
    preloadFrame('hover');
    const { rerender } = renderHook(({ u }) => usePreloadFrames(u), { initialProps: { u: ['x'] } });
    rerender({ u: ['y'] });
    await flush();
    expect(pending.find((p) => p.url === 'hover').aborted).toBe(false);
    expect(pending.find((p) => p.url === 'x').aborted).toBe(true);
  });
});
