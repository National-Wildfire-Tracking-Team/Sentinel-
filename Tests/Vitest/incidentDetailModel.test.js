import { describe, expect, it } from 'vitest';
import {
  buildEvacuations, deriveSituation, directionsUrl, evacuationChangeText, extractIncidentNotes,
  incidentSummary, parseZones, splitAddress, updateTypeLabel,
} from '../../src/app/components/FireDetailPanel/incidentDetailModel';

describe('splitAddress', () => {
  it('splits a reporter address into street and City, County, ST', () => {
    expect(splitAddress('61600 Tamatea Rd, Anza, Riverside County, CA 92539')).toEqual({
      street: '61600 Tamatea Rd',
      locality: 'Anza, Riverside County, CA',
    });
  });

  it('keeps a second address line on the street line', () => {
    expect(splitAddress('100 Main St, Unit 4, Boise, Ada County, ID 83702').street).toBe('100 Main St, Unit 4');
  });

  it('returns free text unchanged when it has no state or county', () => {
    expect(splitAddress('Hwy 371 near mile marker 12')).toEqual({ street: 'Hwy 371 near mile marker 12', locality: '' });
  });
});

describe('deriveSituation', () => {
  it('uses the newest actionable update and ignores non-actionable ones', () => {
    const updates = [
      { id: 'a', update_type: 'road_closure', content: 'Tamatea Rd closed.' },
      { id: 'b', update_type: 'evacuation', content: 'Orders issued.' },
      { id: 'c', update_type: 'threat', content: 'Structures threatened.' },
    ];
    expect(deriveSituation(updates, { order: { zones: [] } })).toEqual({
      text: 'Evacuation order issued', tone: 'red', updateId: 'b',
    });
  });

  it('summarizes automated growth diffs', () => {
    const s = deriveSituation([{ id: 'g', update_type: 'fire_growth', content: 'Containment: 0% → 5%\nAcres: 10 → 1,200' }], null);
    expect(s).toMatchObject({ text: 'Fire growing · 1,200 acres', tone: 'orange' });
  });

  it('is null without actionable updates (including pre-migration rows)', () => {
    expect(deriveSituation([{ id: 'x', content: 'hello' }], null)).toBeNull();
  });
});

describe('buildEvacuations', () => {
  it('builds cards from rows and drops unsafe links', () => {
    const ev = buildEvacuations([
      { level: 'order', zones: ['RIV-E1042'], notes: 'Use Hwy 371.', links: [{ label: 'Map', url: 'https://x.test' }, { label: 'Bad', url: 'javascript:alert(1)' }] },
      { level: 'warning', zones: ['RIV-E1038'], notes: 'Use Hwy 371.', links: [{ label: 'Map', url: 'https://x.test' }] },
    ], {});
    expect(ev.order.zones).toEqual(['RIV-E1042']);
    expect(ev.warning.zones).toEqual(['RIV-E1038']);
    expect(ev.notes).toBe('Use Hwy 371.');
    expect(ev.links).toEqual([{ label: 'Map', url: 'https://x.test' }]);
  });

  it('falls back to CAL FIRE feed fields, and is null with no data', () => {
    expect(buildEvacuations([], { evacuation_orders: 1, evacuation_order_lines: ['Zone A'] }).order.lines).toEqual(['Zone A']);
    expect(buildEvacuations([], {})).toBeNull();
  });
});

describe('updateTypeLabel', () => {
  it('labels typed rows and falls back for untyped ones', () => {
    expect(updateTypeLabel({ update_type: 'road_closure' })).toBe('Road Closure');
    expect(updateTypeLabel({ update_type: 'incident_update', source_type: 'reporter' })).toBe('Field Report');
    expect(updateTypeLabel({ source_type: 'automated', content: 'Acres: 1 → 2' })).toBe('Data Updated');
  });
});

describe('incidentSummary', () => {
  it('reads reporter description fields', () => {
    const s = incidentSummary({
      type: 'user-report',
      title: 'Dagger Fire',
      created_at: '2026-10-05T21:51:00Z',
      description: 'ADDRESS: 61600 Tamatea Rd, Anza, Riverside County, CA 92539\nJURISDICTION: CAL FIRE RRU\n\nINCIDENT NOTES:\nVegetation fire.\n\nAcreage: 12',
    });
    expect(s).toMatchObject({
      name: 'Dagger Fire', street: '61600 Tamatea Rd', locality: 'Anza, Riverside County, CA',
      acres: 12, containment: null, jurisdiction: 'CAL FIRE RRU', notes: 'Vegetation fire.',
    });
  });

  it('shows unknown containment as null, not 0%', () => {
    expect(incidentSummary({ type: 'incident', name: 'X', contained: null, state: 'US-CA', county: 'Riverside' }))
      .toMatchObject({ containment: null, locality: 'Riverside County, CA' });
  });
});

describe('helpers', () => {
  it('extractIncidentNotes stops before ops and internal notes', () => {
    expect(extractIncidentNotes('A\nINCIDENT NOTES:\nPublic\nINTERNAL NOTES:\nsecret')).toBe('Public');
  });

  it('directionsUrl prefers coordinates', () => {
    expect(directionsUrl({ lat: 33.5, lng: -116.6, address: 'x' })).toContain('33.5%2C-116.6');
    expect(directionsUrl({ address: '57430 Mitchell Rd' })).toContain('57430%20Mitchell%20Rd');
    expect(directionsUrl({})).toBeNull();
  });
});

describe('evacuation editing', () => {
  it('parseZones splits on commas and newlines and dedupes', () => {
    expect(parseZones(' RIV-E1042, RIV-E1043\nRIV-E1042 ,')).toEqual(['RIV-E1042', 'RIV-E1043']);
  });

  it('evacuationChangeText describes issued, updated and lifted levels', () => {
    const none = { order: null, warning: null };
    expect(evacuationChangeText(none, { order: { zones: ['A', 'B'] }, warning: null }))
      .toBe('Evacuation order issued for A, B.');
    expect(evacuationChangeText({ order: { zones: ['A'] }, warning: { zones: ['C'] } }, { order: { zones: ['A', 'B'] }, warning: null }))
      .toBe('Evacuation order updated: A, B.\nEvacuation warning lifted.');
    expect(evacuationChangeText({ order: { zones: ['A'] }, warning: null }, { order: { zones: ['A'] }, warning: null })).toBeNull();
  });
});
