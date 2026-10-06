import { describe, expect, it } from 'vitest';
import { mergeFireData } from '../../src/app/hooks/useMergedFireData';
import { mergeIrwinAndCalFireIncidents } from '../../src/app/utils/mergeIncidents';
import {
  incidentIdRealtimeFilter, incidentIdsFor, incidentIdsKey, joinAliasIds, parseAliasIds,
} from '../../src/app/utils/incidentAliases';

const IRWIN_ID = '2026-CARRU-012345';
const CALFIRE_ID = '8f0c2c1e-0000-4000-8000-000000000001';

const point = (lng, lat, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties });
const square = (lng, lat, properties) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[lng - 0.01, lat - 0.01], [lng + 0.01, lat - 0.01], [lng + 0.01, lat + 0.01], [lng - 0.01, lat + 0.01], [lng - 0.01, lat - 0.01]]] },
  properties,
});
const fc = (features) => ({ type: 'FeatureCollection', features });

describe('alias helpers', () => {
  it('parse, join and list ids', () => {
    expect(parseAliasIds(' a, b ,a,,')).toEqual(['a', 'b']);
    expect(parseAliasIds(['a', null, 'b'])).toEqual(['a', 'b']);
    expect(joinAliasIds('a', 'a,b', ['c', 'b'], undefined)).toBe('b,c');
    expect(incidentIdsFor({ id: 'p', aliasIds: ['x', 'p', 'y'] })).toEqual(['p', 'x', 'y']);
    expect(incidentIdsKey(null, ['x'])).toBe('');
  });

  it('builds realtime filters', () => {
    expect(incidentIdRealtimeFilter(['a'])).toBe('incident_id=eq.a');
    expect(incidentIdRealtimeFilter(['a', 'b'])).toBe('incident_id=in.(a,b)');
  });
});

describe('mergeIrwinAndCalFireIncidents', () => {
  it('keeps CAL FIRE on a name match and carries the IRWIN id as an alias', () => {
    const merged = mergeIrwinAndCalFireIncidents(
      [{ id: IRWIN_ID, name: 'Dagger', acres: 10 }, { id: 'other', name: 'Ridge', acres: 5 }],
      [{ id: CALFIRE_ID, name: 'Dagger Fire', acres: 12 }],
    );
    const dagger = merged.find((i) => i.id === CALFIRE_ID);
    expect(dagger.aliasIds).toEqual([IRWIN_ID]);
    expect(merged.map((i) => i.id)).toEqual([CALFIRE_ID, 'other']);
  });

  it('does not mutate its inputs', () => {
    const cal = [{ id: CALFIRE_ID, name: 'Dagger', acres: 1 }];
    mergeIrwinAndCalFireIncidents([{ id: IRWIN_ID, name: 'Dagger', acres: 1 }], cal);
    expect(cal[0].aliasIds).toBeUndefined();
  });
});

describe('mergeFireData (map)', () => {
  const irwinDot = point(-116.6, 33.5, {
    UniqueFireIdentifier: IRWIN_ID, IncidentName: 'DAGGER', GISAcres: 10, ModifiedOnDateTime: 1,
  });
  const calFireDot = point(-116.6, 33.5, {
    UniqueId: CALFIRE_ID, Name: 'Dagger Fire', AcresBurned: 12, PercentContained: 0, County: 'Riverside',
  });

  it('gives the CAL FIRE dot the IRWIN id as an alias', () => {
    const { dots } = mergeFireData(fc([]), fc([irwinDot]), fc([calFireDot]));
    expect(dots.features).toHaveLength(1);
    expect(dots.features[0].properties).toMatchObject({
      UniqueFireIdentifier: CALFIRE_ID, _source: 'CAL_FIRE', _aliasIds: IRWIN_ID,
    });
  });

  it('a WFIGS perimeter matched by name adopts the CAL FIRE id and keeps its own as an alias', () => {
    const perimeter = square(-116.6, 33.5, { UniqueFireIdentifier: IRWIN_ID, IncidentName: 'Dagger', GISAcres: 11 });
    const { perimeters, dots } = mergeFireData(fc([perimeter]), fc([irwinDot]), fc([calFireDot]));
    expect(dots.features).toHaveLength(0);
    expect(perimeters.features[0].properties.UniqueFireIdentifier).toBe(CALFIRE_ID);
    expect(parseAliasIds(perimeters.features[0].properties._aliasIds)).toEqual([IRWIN_ID]);
  });

  it('a nameless perimeter matched by location carries the incident id plus its own', () => {
    const perimeter = square(-116.6, 33.5, { UniqueFireIdentifier: 'firis-capture-1', IncidentName: null });
    const { perimeters } = mergeFireData(fc([perimeter]), fc([irwinDot]), fc([calFireDot]));
    const p = perimeters.features[0].properties;
    expect(p.UniqueFireIdentifier).toBe(CALFIRE_ID);
    expect(parseAliasIds(p._aliasIds).sort()).toEqual(['firis-capture-1', IRWIN_ID].sort());
  });

  it('leaves fires reported by one source without aliases', () => {
    const { dots } = mergeFireData(fc([]), fc([irwinDot]), fc([]));
    expect(dots.features[0].properties._aliasIds).toBeUndefined();
  });
});
