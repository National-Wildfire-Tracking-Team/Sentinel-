import { describe, it, expect } from 'vitest';
import { getFireMatchKey, mergeFireData, pointNearPerimeter, pointsNearSameFire, tagHistoricalMappings } from '../../src/app/hooks/useMergedFireData';

describe('getFireMatchKey', () => {
  it('normalizes a basic fire name', () => {
    expect(getFireMatchKey('RIDGE FIRE')).toBe('RIDGE');
  });

  it('strips PERIMETER suffix', () => {
    expect(getFireMatchKey('RIDGE FIRE PERIMETER')).toBe('RIDGE');
  });

  it('strips INCIDENT suffix', () => {
    expect(getFireMatchKey('RIDGE FIRE INCIDENT')).toBe('RIDGE');
  });

  it('handles slash-separated names (takes last)', () => {
    expect(getFireMatchKey('AREA A/RIDGE FIRE')).toBe('RIDGE');
  });

  it('collapses whitespace', () => {
    expect(getFireMatchKey('RIDGE  FIRE')).toBe('RIDGE');
  });

  it('returns null for null/undefined', () => {
    expect(getFireMatchKey(null)).toBeNull();
    expect(getFireMatchKey(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getFireMatchKey('')).toBeNull();
  });

  it('returns null for "Unknown"', () => {
    expect(getFireMatchKey('Unknown')).toBeNull();
  });

  it('returns null for "Unknown Fire"', () => {
    expect(getFireMatchKey('Unknown Fire')).toBeNull();
  });

  it('returns null for "Unnamed"', () => {
    expect(getFireMatchKey('Unnamed')).toBeNull();
  });

  it('returns null for whitespace-only string that normalizes to empty', () => {
    expect(getFireMatchKey('   ')).toBeNull();
  });

  it('handles lowercase input', () => {
    expect(getFireMatchKey('ridge fire')).toBe('RIDGE');
  });

  it('handles mixed case', () => {
    expect(getFireMatchKey('Ridge Fire')).toBe('RIDGE');
  });

  it('strips multiple FIRE PERIMETER occurrences', () => {
    expect(getFireMatchKey('CREEK FIRE PERIMETER')).toBe('CREEK');
  });

  it('handles single-word names', () => {
    expect(getFireMatchKey('CREEK')).toBe('CREEK');
  });

  it('returns null when normalization leaves empty string', () => {
    // "FIRE" alone becomes empty after stripping
    expect(getFireMatchKey('FIRE')).toBeNull();
  });

  it('handles names with numbers', () => {
    expect(getFireMatchKey('HIGHWAY 5 FIRE')).toBe('HIGHWAY5');
  });
});

describe('mergeFireData — repeated nameless captures of one fire', () => {
  // Shape of the Bouquet Fire (2026-10-05): several nameless FIRIS/USFS heat
  // perimeters of one fire, two IRWIN records and a CAL FIRE record.
  const square = (lng, lat, size, properties) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[lng - size, lat - size], [lng + size, lat - size], [lng + size, lat + size], [lng - size, lat + size], [lng - size, lat - size]]] },
    properties,
  });
  const point = (lng, lat, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties });
  const fc = (features) => ({ type: 'FeatureCollection', features });

  const captures = () => tagHistoricalMappings(fc([
    square(-118.40, 34.56, 0.010, { UniqueFireIdentifier: 'old-1', IncidentName: 'Unknown Fire', ModifiedOnDateTime: '2026-10-03T23:49:07Z' }),
    square(-118.40, 34.56, 0.011, { UniqueFireIdentifier: 'old-2', IncidentName: 'Unknown Fire', ModifiedOnDateTime: '2026-10-04T00:26:44Z' }),
    square(-118.40, 34.56, 0.012, { UniqueFireIdentifier: 'current', IncidentName: 'Unknown Fire', ModifiedOnDateTime: '2026-10-04T23:37:20Z' }),
  ]));
  const irwin = fc([
    point(-118.4018, 34.5618, { UniqueFireIdentifier: '2026-CAANF-264196', IncidentName: 'BOUQUET', GISAcres: 0.1, PercentContained: 40, ModifiedOnDateTime: 1 }),
  ]);
  const calFire = fc([
    point(-118.4041, 34.5618, { UniqueId: 'calfire-bouquet', Name: 'Bouquet Fire', AcresBurned: 1048, PercentContained: 48, Updated: '2026-10-05T23:22:39Z' }),
  ]);

  it('names the current capture, not an older one, with CAL FIRE stats', () => {
    const { perimeters, dots } = mergeFireData(captures(), irwin, calFire);
    const current = perimeters.features.find(f => !f.properties.isHistoricalMapping);
    expect(current.properties).toMatchObject({
      IncidentName: 'Bouquet Fire',
      UniqueFireIdentifier: 'calfire-bouquet',
      PercentContained: 48,
      GISAcres: 1048,
      ModifiedOnDateTime: '2026-10-05T23:22:39.000Z',
    });
    expect(current.properties._aliasIds.split(',')).toEqual(expect.arrayContaining(['current', '2026-CAANF-264196']));
    expect(dots.features).toHaveLength(0);
  });

  it('labels the older captures of the same fire too', () => {
    const { perimeters } = mergeFireData(captures(), irwin, calFire);
    const historical = perimeters.features.filter(f => f.properties.isHistoricalMapping);
    expect(historical).toHaveLength(2);
    historical.forEach(f => expect(f.properties.IncidentName).toBe('Bouquet Fire'));
  });

  it('does not let a separate nearby fire reuse the name', () => {
    const other = square(-118.40, 34.56, 0.5, { UniqueFireIdentifier: 'other', IncidentName: null, ModifiedOnDateTime: '2026-10-01T00:00:00Z' });
    const { perimeters } = mergeFireData(fc([square(-118.40, 34.56, 0.01, { UniqueFireIdentifier: 'current', IncidentName: null }), other]), irwin, calFire);
    const names = perimeters.features.map(f => f.properties.IncidentName);
    expect(names.filter(n => n === 'Bouquet Fire')).toHaveLength(1);
  });
});

describe('mergeFireData — same-named fires in different places', () => {
  // Live case (2026-10-22): a Colorado "Willow" perimeter took an inactive
  // California "Willow Fire"'s id, containment and update time by name alone.
  const square = (lng, lat, size, properties) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[lng - size, lat - size], [lng + size, lat - size], [lng + size, lat + size], [lng - size, lat + size], [lng - size, lat - size]]] },
    properties,
  });
  const point = (lng, lat, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties });
  const fc = (features) => ({ type: 'FeatureCollection', features });

  const coPerimeter = fc([square(-105.5, 38.9, 0.05, { UniqueFireIdentifier: 'perim-co', IncidentName: 'Willow', GISAcres: 7259, PercentContained: 0 })]);
  const coIrwin = point(-105.51, 38.91, { UniqueFireIdentifier: '2026-COPSF-001153', IncidentName: 'Willow', GISAcres: 7359, PercentContained: 92, ModifiedOnDateTime: '2026-10-22T19:28:00Z' });
  const caCalFire = fc([point(-121.2, 37.8, { UniqueId: 'calfire-willow', Name: 'Willow Fire', AcresBurned: 40, PercentContained: 100, Updated: '2026-10-23T00:00:00Z' })]);

  it('matches a perimeter only to the same-named incident close by', () => {
    const { perimeters, dots } = mergeFireData(coPerimeter, fc([coIrwin]), caCalFire);
    expect(perimeters.features[0].properties).toMatchObject({
      UniqueFireIdentifier: '2026-COPSF-001153',
      PercentContained: 92,
    });
    expect(dots.features.map(f => f.properties.UniqueFireIdentifier)).toEqual(['calfire-willow']);
  });

  it('keeps same-named fires far apart as separate fires', () => {
    const wiIrwin = point(-89.9, 45.98, { UniqueFireIdentifier: '2026-WI-LINE', IncidentName: 'Line', ModifiedOnDateTime: 2 });
    const nmIrwin = point(-103.13, 35.46, { UniqueFireIdentifier: '2026-NM-LINE', IncidentName: 'Line', ModifiedOnDateTime: 1 });
    const { dots } = mergeFireData(fc([]), fc([wiIrwin, nmIrwin]), null);
    expect(dots.features.map(f => f.properties.UniqueFireIdentifier).sort()).toEqual(['2026-NM-LINE', '2026-WI-LINE']);
  });

  it('still merges same-named records of one fire', () => {
    const a = point(-118.40, 34.56, { UniqueFireIdentifier: 'irwin-1', IncidentName: 'Bouquet', ModifiedOnDateTime: 1 });
    const b = point(-118.45, 34.60, { UniqueFireIdentifier: 'irwin-2', IncidentName: 'Bouquet', ModifiedOnDateTime: 2 });
    const { dots } = mergeFireData(fc([]), fc([a, b]), null);
    expect(dots.features).toHaveLength(1);
    expect(dots.features[0].properties.UniqueFireIdentifier).toBe('irwin-2');
    expect(dots.features[0].properties._aliasIds).toBe('irwin-1');
  });
});

describe('pointsNearSameFire', () => {
  it('is true within 30 km and false beyond', () => {
    expect(pointsNearSameFire([-118.40, 34.56], [-118.45, 34.60])).toBe(true);
    expect(pointsNearSameFire([-89.9, 45.98], [-103.13, 35.46])).toBe(false);
  });

  it('never takes a record with no usable location for another fire', () => {
    expect(pointsNearSameFire([0, 0], [-103.13, 35.46])).toBe(false);
    expect(pointsNearSameFire(undefined, [-103.13, 35.46])).toBe(false);
    expect(pointsNearSameFire([NaN, NaN], [-103.13, 35.46])).toBe(false);
  });
});

describe('pointNearPerimeter', () => {
  const perimeter = { type: 'Polygon', coordinates: [[[-105.6, 38.8], [-105.4, 38.8], [-105.4, 39.0], [-105.6, 39.0], [-105.6, 38.8]]] };

  it('matches a point at or near the perimeter, not one across the country', () => {
    expect(pointNearPerimeter([-105.5, 38.9], perimeter)).toBe(true);
    expect(pointNearPerimeter([-121.2, 37.8], perimeter)).toBe(false);
  });

  it('never matches without both a location and a perimeter', () => {
    expect(pointNearPerimeter([NaN, NaN], perimeter)).toBe(false);
    expect(pointNearPerimeter([-105.5, 38.9], null)).toBe(false);
  });
});

describe('mergeFireData — records with no location', () => {
  const point = (lng, lat, properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties });
  const fc = (features) => ({ type: 'FeatureCollection', features });

  it('keeps a same-named fire with no usable location as its own fire', () => {
    const located = point(-105.5, 38.9, { UniqueFireIdentifier: 'co', IncidentName: 'Willow', ModifiedOnDateTime: 1 });
    const unlocated = point(0, 0, { UniqueFireIdentifier: 'unknown', IncidentName: 'Willow', ModifiedOnDateTime: 2 });
    const { dots } = mergeFireData(fc([]), fc([located, unlocated]), null);
    expect(dots.features.map(f => f.properties.UniqueFireIdentifier).sort()).toEqual(['co', 'unknown']);
  });
});
