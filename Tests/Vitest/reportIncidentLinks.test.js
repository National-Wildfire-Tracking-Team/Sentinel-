import { describe, it, expect } from 'vitest';
import { officialIdsForReport, reportIdsForName } from '../../src/app/utils/reportIncidentLinks';

describe('officialIdsForReport', () => {
  const incidents = [
    { id: 'calfire-1', name: 'Ridge Fire', aliasIds: ['irwin-1'] },
    { id: 'calfire-2', name: 'Canyon' },
  ];

  it('returns the CAL FIRE id and its aliases for a same-named report', () => {
    expect(officialIdsForReport({ id: 'r1', title: 'RIDGE' }, incidents)).toEqual(['calfire-1', 'irwin-1']);
  });

  it('returns nothing for an unmatched or unnamed report', () => {
    expect(officialIdsForReport({ id: 'r1', title: 'Other Fire' }, incidents)).toEqual([]);
    expect(officialIdsForReport({ id: 'r1', title: 'Unknown' }, incidents)).toEqual([]);
    expect(officialIdsForReport({ id: 'r1', title: 'Ridge' }, [])).toEqual([]);
  });
});

describe('reportIdsForName', () => {
  it('returns every report of the same fire', () => {
    const reports = [
      { id: 'r1', title: 'Ridge Fire' },
      { id: 'r2', title: 'RIDGE' },
      { id: 'r3', title: 'Canyon Fire' },
    ];
    expect(reportIdsForName('Ridge', reports)).toEqual(['r1', 'r2']);
    expect(reportIdsForName('', reports)).toEqual([]);
  });
});
