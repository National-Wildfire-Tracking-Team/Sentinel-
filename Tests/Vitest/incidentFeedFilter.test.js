import { describe, it, expect } from 'vitest';
import { filterFeedIncidents, isActiveFire } from '../../src/app/components/Sidebar/incidentFeedFilter';

const NOW = new Date('2026-10-09T12:00:00Z').getTime();
const recent = '2026-10-08T12:00:00Z';
const fire = (contained, extra = {}) => ({ contained, status: contained >= 100 ? 'controlled' : 'active', updated: recent, ...extra });

describe('incidentFeedFilter', () => {
  const incidents = [fire(0), fire(50), fire(97), fire(100), fire(10, { updated: '2026-10-01T00:00:00Z' })];

  it('All Fires counts every recently updated fire, contained or not', () => {
    expect(filterFeedIncidents(incidents, 'all', NOW)).toHaveLength(4);
  });

  it('Active Fires counts only fires under 95% contained', () => {
    expect(filterFeedIncidents(incidents, 'focused', NOW).map(i => i.contained)).toEqual([0, 50]);
  });

  it('treats 95%+ or controlled fires as not active', () => {
    expect(isActiveFire(fire(94))).toBe(true);
    expect(isActiveFire(fire(95))).toBe(false);
    expect(isActiveFire({ contained: 0, status: 'controlled' })).toBe(false);
  });
});
