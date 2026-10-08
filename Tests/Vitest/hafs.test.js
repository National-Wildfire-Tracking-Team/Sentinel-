/**
 * hafs.test.js
 * HAFS on the Models tab: the client's parsing and frame URLs, and the
 * selection rules (storms across configurations, fallbacks, timeline,
 * field availability, prefetch), plus the shareable link.
 */

import { describe, it, expect } from 'vitest';
import { hafsFrameUrl, parseHafsCatalog, parseHafsRun } from '../../src/app/api/hafs';
import {
  defaultRun, effectiveHafsField, hafsFields, hafsFrameAt, hafsPrefetchPlan, hafsStorms, hafsTimeline,
  resolveHafsSelection, stormLabel,
} from '../../src/app/utils/hafsSelection';
import { modelsHref, parseModelsQuery } from '../../src/app/utils/weatherModelsLink';

const domains = (hours) => ({ storm: { hours, latestHour: hours.at(-1) }, parent: { hours, latestHour: hours.at(-1) } });
const storm = (id, atcfId, name, status, hours) => ({ id, atcfId, basin: atcfId.slice(0, 2), name, status, latestHour: hours.at(-1), domains: domains(hours) });

const CATALOG = {
  schemaVersion: 1, kind: 'hafs-catalog', days: 3, notice: 'n', attribution: 'a',
  fields: [
    { id: 'windSpeed10m', label: '10 m wind speed', origin: 'calculated', quantity: 'speed', units: 'm/s' },
    { id: 'mslp', label: 'Mean sea-level pressure', origin: 'native', quantity: 'pressure', units: 'hPa' },
    { id: 'precipTotal', label: 'Total precipitation', origin: 'native', quantity: 'depth', units: 'mm' },
  ],
  models: [
    { id: 'hfsa', name: 'HAFS-A', status: 'operational', domains: [], runs: [
      { cycle: '2026100812', initTime: '2026-10-08T12:00:00Z', storms: [storm('09l', 'AL092026', 'ISAIAS', 'in-progress', [0, 3])] },
      { cycle: '2026100806', initTime: '2026-10-08T06:00:00Z', storms: [
        storm('27w', 'WP272026', 'KOGUMA', 'complete', [0, 3, 6]),
        storm('09l', 'AL092026', 'ISAIAS', 'complete', [0, 3, 6]),
        storm('18e', 'EP182026', null, 'complete', [0, 3, 6]),
      ] },
    ] },
    { id: 'hfsb', name: 'HAFS-B', status: 'operational', domains: [], runs: [
      { cycle: '2026100806', initTime: '2026-10-08T06:00:00Z', storms: [storm('09l', 'AL092026', 'ISAIAS', 'complete', [0, 3, 6])] },
    ] },
    { id: 'hwrf', name: 'HWRF', status: 'legacy', domains: [], runs: [] },
  ],
};

const frame = (h, w = -95 + h / 10) => ({
  validTime: new Date(Date.UTC(2026, 9, 8, 6 + h)).toISOString().replace('.000Z', 'Z'),
  coordinates: [[w, 30], [w + 20, 30], [w + 20, 15], [w, 15]], bounds: [w, 15, w + 20, 30], size: [1001, 880],
});
const DETAIL = {
  schemaVersion: 1, kind: 'hafs-run', cycle: '2026100806', initTime: '2026-10-08T06:00:00Z',
  domains: {
    storm: {
      hours: [0, 3, 6], frames: { 0: frame(0), 3: frame(3), 6: frame(6) },
      fields: { windSpeed10m: [0, 3, 6], mslp: [0, 3, 6], precipTotal: [3, 6] }, problems: [],
    },
  },
};

describe('HAFS client', () => {
  it('accepts only its own schema', () => {
    expect(parseHafsCatalog(CATALOG)).toBe(CATALOG);
    expect(() => parseHafsCatalog({ ...CATALOG, schemaVersion: 2 })).toThrow('Unexpected');
    expect(() => parseHafsCatalog({ ...CATALOG, models: undefined })).toThrow('Incomplete');
    expect(parseHafsRun(DETAIL)).toBe(DETAIL);
    expect(() => parseHafsRun({ kind: 'hafs-catalog', schemaVersion: 1 })).toThrow();
  });

  it('builds frame URLs only from plain ids', () => {
    const p = { model: 'hfsa', cycle: '2026100806', storm: '09l', domain: 'storm', field: 'mslp', hour: 3 };
    expect(hafsFrameUrl('https://cdn.example/hafs/v1', p)).toBe('https://cdn.example/hafs/v1/frames/hfsa/2026100806/09l/storm/mslp/3.png');
    expect(hafsFrameUrl('https://cdn.example/hafs/v1', { ...p, field: '../x' })).toBeNull();
    expect(hafsFrameUrl('https://cdn.example/hafs/v1', { ...p, hour: 1.5 })).toBeNull();
    expect(hafsFrameUrl(null, p)).toBeNull();
  });
});

describe('HAFS selection', () => {
  it('merges storms across configurations, NHC basins first', () => {
    const storms = hafsStorms(CATALOG);
    expect(storms.map((s) => s.key)).toEqual(['AL092026', 'EP182026', 'WP272026']);
    const isaias = storms[0];
    expect(isaias.runs.hfsa.map((r) => r.cycle)).toEqual(['2026100812', '2026100806']);
    expect(isaias.runs.hfsb).toHaveLength(1);
    expect(stormLabel(isaias)).toBe('Isaias (AL09)');
    expect(stormLabel(storms[1])).toBe('Storm 18E');
  });

  it('defaults to the newest complete run', () => {
    expect(defaultRun(hafsStorms(CATALOG)[0].runs.hfsa).cycle).toBe('2026100806');
    expect(defaultRun([{ cycle: 'x', status: 'in-progress' }]).cycle).toBe('x');
    expect(defaultRun([])).toBeNull();
  });

  it('keeps a valid choice and repairs an invalid one', () => {
    const sel = resolveHafsSelection(CATALOG, { storm: 'AL092026', model: 'hfsb', cycle: '2026100806', domain: 'parent' });
    expect([sel.storm.key, sel.model, sel.cycle, sel.domain]).toEqual(['AL092026', 'hfsb', '2026100806', 'parent']);
    expect(sel.models.map((m) => m.id)).toEqual(['hfsa', 'hfsb']);

    // Koguma has no HAFS-B run; the cycle and domain are unknown.
    const fixed = resolveHafsSelection(CATALOG, { storm: 'WP272026', model: 'hfsb', cycle: '2020010100', domain: 'outer' });
    expect([fixed.storm.key, fixed.model, fixed.cycle, fixed.domain]).toEqual(['WP272026', 'hfsa', '2026100806', 'storm']);
    expect(resolveHafsSelection(CATALOG, { storm: 'AL992026' }).storm.key).toBe('AL092026');
    expect(resolveHafsSelection({ ...CATALOG, models: [] })).toBeNull();
    expect(resolveHafsSelection(null)).toBeNull();
  });

  it('steps through the run hour by hour, each with its own corners', () => {
    const times = hafsTimeline(DETAIL, 'storm');
    expect(times).toEqual(['2026-10-08T06:00:00Z', '2026-10-08T09:00:00Z', '2026-10-08T12:00:00Z']);
    const f = hafsFrameAt(DETAIL, 'storm', times[1]);
    expect(f.hour).toBe(3);
    expect(f.coordinates[0][0]).toBeCloseTo(-94.7);
    expect(hafsFrameAt(DETAIL, 'storm', '2026-10-09T00:00:00Z')).toBeNull();
    expect(hafsTimeline(DETAIL, 'parent')).toEqual([]);
  });

  it('lists fields with what the run offers, and falls back from a missing one', () => {
    const fields = hafsFields({ ...CATALOG, fields: [...CATALOG.fields, { id: 'gust', label: 'Wind gust' }] }, DETAIL, 'storm');
    expect(fields.find((f) => f.id === 'precipTotal').hours).toEqual([3, 6]);
    expect(fields.find((f) => f.id === 'gust')).toMatchObject({ available: false, reason: 'Not in this run' });
    expect(effectiveHafsField(fields, 'mslp')).toBe('mslp');
    expect(effectiveHafsField(fields, 'gust')).toBe('windSpeed10m');
    // Before the run detail arrives nothing is available, and nothing claims a reason.
    expect(hafsFields(CATALOG, null, 'storm').every((f) => !f.available && !f.reason)).toBe(true);
  });

  it('prefetches the next hours and the same hour in other fields, skipping hours a field lacks', () => {
    const sel = resolveHafsSelection(CATALOG, { storm: 'AL092026' });
    const fields = hafsFields(CATALOG, DETAIL, 'storm');
    const timeline = hafsTimeline(DETAIL, 'storm');
    const base = 'https://cdn.example/hafs/v1';
    const urls = hafsPrefetchPlan({ base, sel, detail: DETAIL, field: 'precipTotal', fields, validTime: timeline[0], timeline });
    const tail = (u) => u.split('/frames/')[1];
    expect(urls.map(tail)).toEqual([
      'hfsa/2026100806/09l/storm/precipTotal/3.png',
      'hfsa/2026100806/09l/storm/precipTotal/6.png',
      'hfsa/2026100806/09l/storm/mslp/0.png',
      'hfsa/2026100806/09l/storm/windSpeed10m/0.png',
    ]);
    expect(hafsPrefetchPlan({ base: null, sel, detail: DETAIL, field: 'mslp', fields, validTime: timeline[0], timeline })).toEqual([]);
  });
});

describe('HAFS links', () => {
  it('round-trips the mode, field and storm', () => {
    const href = modelsHref({ model: 'hafs', variable: 'windSpeed10m', storm: 'AL092026' });
    expect(href).toBe('/?tab=models&model=hafs&var=windSpeed10m&storm=AL092026');
    expect(parseModelsQuery(href.slice(1))).toMatchObject({ mode: 'hafs', variable: 'windSpeed10m', storm: 'AL092026' });
    expect(parseModelsQuery('?tab=models&model=hafs&storm=../etc').storm).toBeNull();
    expect(modelsHref({ model: 'gfs', storm: 'AL092026' })).not.toContain('storm');
  });
});
