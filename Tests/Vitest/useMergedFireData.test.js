import { describe, it, expect } from 'vitest';
import { getFireMatchKey, mergeFireData, tagHistoricalMappings } from '../../src/app/hooks/useMergedFireData';

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
