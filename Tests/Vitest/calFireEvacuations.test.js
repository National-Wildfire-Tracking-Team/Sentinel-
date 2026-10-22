import { describe, expect, it } from 'vitest';
import {
  AUTO_NOTES,
  assignZonesToIncidents,
  classifyZoneStatus,
  describeEvacuationChanges,
  matchRadiusMiles,
  planEvacuationWrites,
  zoneLabel,
} from '../../supabase/functions/_shared/calFireEvacuations.js';

/** A ~0.6 mi square zone centred on (lat, lng). */
function zone(identifer, status, lat, lng, name = '') {
  const d = 0.005;
  return {
    type: 'Feature',
    properties: { identifer, status, commonly_known_as: name, latitude: String(lat), longitude: String(lng) },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]]],
    },
  };
}

describe('classifyZoneStatus', () => {
  it('maps Genasys statuses to order / warning', () => {
    expect(classifyZoneStatus('Evacuation Order')).toBe('order');
    expect(classifyZoneStatus('Evacuation Warning')).toBe('warning');
    expect(classifyZoneStatus('Evacuation Level 3 - Go Now')).toBe('order');
    expect(classifyZoneStatus('Evacuation Level 2 - Be Set')).toBe('warning');
  });

  it('ignores lifted, advisory and normal zones', () => {
    for (const s of ['Evacuation Order Lifted', 'Lifted', 'Advisory', 'Normal', 'Shelter in Place', null]) {
      expect(classifyZoneStatus(s)).toBeNull();
    }
  });
});

describe('matchRadiusMiles', () => {
  it('is at least 5 mi and grows with fire size', () => {
    expect(matchRadiusMiles(0)).toBe(5);
    expect(matchRadiusMiles(1365)).toBe(5);
    expect(matchRadiusMiles(100000)).toBeCloseTo(14.1, 1);
  });
});

describe('zoneLabel', () => {
  it('drops the state/county prefix and adds the common name', () => {
    expect(zoneLabel('US-CA-XMY-MRY-F023-A', 'Big Sur Region')).toBe('MRY-F023-A (Big Sur Region)');
    expect(zoneLabel('US-CA-XME-MEN-3YOR03', '')).toBe('MEN-3YOR03');
  });
});

describe('assignZonesToIncidents', () => {
  const a = { id: 'A', lat: 38.8, lng: -123.2, acres: 1000 };
  const b = { id: 'B', lat: 38.8, lng: -123.0, acres: 1000 }; // ~10.8 mi east of A

  it('assigns zones near a fire and skips far or non-evacuation zones', () => {
    const result = assignZonesToIncidents([a], [
      zone('US-CA-XME-MEN-1', 'Evacuation Order', 38.82, -123.2, 'Hopland'),
      zone('US-CA-XME-MEN-2', 'Evacuation Warning', 38.8, -123.15),
      zone('US-CA-XME-MEN-3', 'Evacuation Order', 39.5, -123.2),
      zone('US-CA-XME-MEN-4', 'Lifted', 38.8, -123.2),
    ]);
    expect(result.get('A')).toEqual({ order: ['MEN-1 (Hopland)'], warning: ['MEN-2'] });
  });

  it('gives a zone within reach of two fires to the nearer one', () => {
    const result = assignZonesToIncidents([a, b], [zone('US-CA-XME-MEN-9', 'Evacuation Order', 38.8, -123.06)]);
    expect(result.has('A')).toBe(false);
    expect(result.get('B').order).toEqual(['MEN-9']);
  });
});

describe('planEvacuationWrites', () => {
  const assignments = new Map([['A', { order: ['Z1', 'Z2'], warning: [] }]]);

  it('creates rows for new evacuations', () => {
    const plan = planEvacuationWrites({ incidentIds: ['A'], assignments, existingRows: [] });
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0]).toMatchObject({ incident_id: 'A', level: 'order', zones: ['Z1', 'Z2'], created_by: null });
    expect(plan.deletes).toEqual([]);
  });

  it('does nothing when its own row is unchanged', () => {
    const existingRows = [{ incident_id: 'A', level: 'order', zones: ['Z2', 'Z1'], notes: AUTO_NOTES, created_by: null }];
    const plan = planEvacuationWrites({ incidentIds: ['A'], assignments, existingRows });
    expect(plan.upserts).toEqual([]);
    expect(plan.changes).toEqual([]);
  });

  it('deletes its own rows once the zones are lifted', () => {
    const existingRows = [{ incident_id: 'A', level: 'warning', zones: ['Z3'], notes: AUTO_NOTES, created_by: null }];
    const plan = planEvacuationWrites({ incidentIds: ['A'], assignments, existingRows });
    expect(plan.deletes).toEqual([{ incident_id: 'A', level: 'warning' }]);
  });

  it('never touches a reporter-entered row', () => {
    const existingRows = [
      { incident_id: 'A', level: 'order', zones: ['Reporter zone'], notes: 'From the sheriff', created_by: 'u1' },
      { incident_id: 'A', level: 'warning', zones: ['W'], notes: 'Hand entered', created_by: null },
    ];
    const plan = planEvacuationWrites({ incidentIds: ['A'], assignments, existingRows });
    expect(plan.upserts).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });
});

describe('describeEvacuationChanges', () => {
  it('lists new and lifted zones', () => {
    expect(describeEvacuationChanges([
      { level: 'order', before: ['Z1'], after: ['Z1', 'Z2'] },
      { level: 'warning', before: ['Z5'], after: [] },
    ])).toBe('Evacuation order: Z2\nEvacuation warning lifted: Z5');
  });

  it('reports a warning upgraded to an order only as the order', () => {
    expect(describeEvacuationChanges([
      { level: 'order', before: [], after: ['Z5'] },
      { level: 'warning', before: ['Z5'], after: [] },
    ])).toBe('Evacuation order: Z5');
  });
});
