import { describe, it, expect } from 'vitest';
import {
  isInvestClassification,
  formatInvestId,
  filterByInvestStatus,
} from '../../src/app/api/nhcStorms';
import { matchInvestsToOutlookAreas } from '../../src/app/api/nhcInvests';

describe('isInvestClassification', () => {
  it('treats DB, LO, and WV as pre-genesis Invests', () => {
    expect(isInvestClassification('DB')).toBe(true);
    expect(isInvestClassification('LO')).toBe(true);
    expect(isInvestClassification('WV')).toBe(true);
    expect(isInvestClassification('db')).toBe(true);
  });

  it('treats designated cyclone classifications as not an Invest', () => {
    expect(isInvestClassification('TD')).toBe(false);
    expect(isInvestClassification('TS')).toBe(false);
    expect(isInvestClassification('HU')).toBe(false);
    expect(isInvestClassification('EX')).toBe(false);
    expect(isInvestClassification('')).toBe(false);
    expect(isInvestClassification(undefined)).toBe(false);
  });
});

describe('formatInvestId', () => {
  it('formats an Atlantic bin number as <number>L', () => {
    expect(formatInvestId('AL92')).toBe('92L');
  });

  it('formats an Eastern Pacific bin number as <number>E', () => {
    expect(formatInvestId('EP90')).toBe('90E');
  });

  it('formats a Central Pacific bin number as <number>C', () => {
    expect(formatInvestId('CP91')).toBe('91C');
  });

  it('falls back to the raw id when the bin number is missing or malformed', () => {
    expect(formatInvestId('', 'AL932025')).toBe('AL932025');
    expect(formatInvestId(null, 'AL932025')).toBe('AL932025');
    expect(formatInvestId('not-a-bin-number')).toBe('NOT-A-BIN-NUMBER');
  });
});

describe('filterByInvestStatus', () => {
  const geoJSON = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: null, properties: { id: 'AL92', isInvest: true } },
      { type: 'Feature', geometry: null, properties: { id: 'AL01', isInvest: false } },
      { type: 'Feature', geometry: null, properties: { id: 'AL02' } }, // undefined isInvest
    ],
  };

  it('returns only Invests when wantInvest is true', () => {
    const result = filterByInvestStatus(geoJSON, true);
    expect(result.features.map((f) => f.properties.id)).toEqual(['AL92']);
  });

  it('returns only cyclones when wantInvest is false (undefined counts as false)', () => {
    const result = filterByInvestStatus(geoJSON, false);
    expect(result.features.map((f) => f.properties.id)).toEqual(['AL01', 'AL02']);
  });

  it('passes through null/undefined input unchanged', () => {
    expect(filterByInvestStatus(null, true)).toBeNull();
    expect(filterByInvestStatus(undefined, true)).toBeUndefined();
  });
});

describe('matchInvestsToOutlookAreas', () => {
  const investCenters = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-70, 20] },
        properties: { id: 'AL92', investId: '92L', isInvest: true },
      },
    ],
  };

  const outlookAreas = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[-71, 19], [-69, 19], [-69, 21], [-71, 21], [-71, 19]]],
        },
        properties: {
          id: 'nhc-dist-1',
          formationChance: 'HIGH',
          day2Percent: 40,
          day7Percent: 80,
          outlookText: 'Area of disturbed weather could develop over the next several days.',
        },
      },
    ],
  };

  it('enriches an Invest point with the nearest outlook area', () => {
    const result = matchInvestsToOutlookAreas(investCenters, outlookAreas);
    expect(result.features).toHaveLength(1);
    const props = result.features[0].properties;
    expect(props.investId).toBe('92L');
    expect(props.day2Percent).toBe(40);
    expect(props.day7Percent).toBe(80);
    expect(props.formationChance).toBe('HIGH');
    expect(props.outlookText).toContain('disturbed weather');
  });

  it('leaves formation fields null when no outlook area is nearby', () => {
    const farAreas = {
      type: 'FeatureCollection',
      features: [{
        ...outlookAreas.features[0],
        geometry: {
          type: 'Polygon',
          coordinates: [[[100, 40], [102, 40], [102, 42], [100, 42], [100, 40]]],
        },
      }],
    };
    const result = matchInvestsToOutlookAreas(investCenters, farAreas);
    expect(result.features[0].properties.day2Percent).toBeNull();
    expect(result.features[0].properties.formationChance).toBeNull();
  });

  it('returns an empty FeatureCollection when there are no Invest points', () => {
    const result = matchInvestsToOutlookAreas({ type: 'FeatureCollection', features: [] }, outlookAreas);
    expect(result.features).toEqual([]);
  });
});
