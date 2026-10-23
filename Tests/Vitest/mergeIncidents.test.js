import { describe, it, expect } from 'vitest';
import { mergeIrwinAndCalFireIncidents } from '../../src/app/utils/mergeIncidents';
import { dedupeIncidentsByName } from '../../src/app/hooks/useIncidents';

const incident = (id, name, lng, lat, extra = {}) => ({ id, name, lng, lat, acres: 10, updated: '2026-10-22T00:00:00Z', ...extra });

describe('mergeIrwinAndCalFireIncidents', () => {
  it('folds an IRWIN record into the CAL FIRE record of the same fire', () => {
    const merged = mergeIrwinAndCalFireIncidents(
      [incident('2026-CA-SODA', 'SODA', -122.84, 41.97)],
      [incident('calfire-soda', 'Soda Fire', -122.85, 41.98, { source: 'CAL_FIRE' })],
    );
    expect(merged.map(i => i.id)).toEqual(['calfire-soda']);
    expect(merged[0].aliasIds).toEqual(['2026-CA-SODA']);
  });

  it('keeps a same-named IRWIN fire elsewhere as its own fire', () => {
    const merged = mergeIrwinAndCalFireIncidents(
      [incident('2026-MI-RIDGE', 'Ridge', -84.5, 45.2, { acres: 466 })],
      [incident('calfire-ridge', 'Ridge Fire', -120.1, 38.4, { source: 'CAL_FIRE' })],
    );
    expect(merged.map(i => i.id)).toEqual(['2026-MI-RIDGE', 'calfire-ridge']);
    expect(merged.find(i => i.id === 'calfire-ridge').aliasIds).toEqual([]);
  });
});

describe('mergeIrwinAndCalFireIncidents — no usable location', () => {
  it('never folds a fire into a same-named one when either has no location', () => {
    const merged = mergeIrwinAndCalFireIncidents(
      [incident('2026-WI-LINE', 'Line', 0, 0)],
      [incident('calfire-line', 'Line Fire', -120.1, 38.4, { source: 'CAL_FIRE' })],
    );
    expect(merged.map(i => i.id).sort()).toEqual(['2026-WI-LINE', 'calfire-line']);
  });
});

describe('dedupeIncidentsByName', () => {
  it('collapses two records of one fire to the latest', () => {
    const kept = dedupeIncidentsByName([
      incident('a', 'Elk', -105.0, 39.0, { updated: '2026-10-20T00:00:00Z' }),
      incident('b', 'Elk', -105.05, 39.02, { updated: '2026-10-22T00:00:00Z' }),
    ]);
    expect(kept.map(i => i.id)).toEqual(['b']);
  });

  it('keeps same-named fires in different places', () => {
    const kept = dedupeIncidentsByName([
      incident('nm', 'Line', -103.13, 35.46),
      incident('wi', 'Line', -89.88, 45.98),
    ]);
    expect(kept.map(i => i.id).sort()).toEqual(['nm', 'wi']);
  });
});
