import { describe, it, expect } from 'vitest';
import { nhcStormColor } from '../../src/app/api/nhcStorms';

describe('nhcStormColor', () => {
  it('returns fuchsia for Category 5 Hurricane', () => {
    expect(nhcStormColor(140, 'HU')).toBe('#c026d3');
    expect(nhcStormColor(160, 'HU')).toBe('#c026d3');
  });

  it('returns red for Category 4 Hurricane', () => {
    expect(nhcStormColor(115, 'HU')).toBe('#ef4444');
    expect(nhcStormColor(136, 'HU')).toBe('#ef4444');
  });

  it('returns orange for Category 3 Hurricane', () => {
    expect(nhcStormColor(100, 'HU')).toBe('#f97316');
    expect(nhcStormColor(112, 'HU')).toBe('#f97316');
  });

  it('returns amber for Category 2 Hurricane', () => {
    expect(nhcStormColor(85, 'HU')).toBe('#eab308');
    expect(nhcStormColor(95, 'HU')).toBe('#eab308');
  });

  it('returns yellow for Category 1 Hurricane', () => {
    expect(nhcStormColor(70, 'HU')).toBe('#facc15');
    expect(nhcStormColor(82, 'HU')).toBe('#facc15');
  });

  it('returns sky for Tropical Storm', () => {
    expect(nhcStormColor(45, 'TS')).toBe('#38bdf8');
    expect(nhcStormColor(63, 'TS')).toBe('#38bdf8');
  });

  it('returns slate for Tropical Depression', () => {
    expect(nhcStormColor(25, 'TD')).toBe('#64748b');
    expect(nhcStormColor(10, 'TD')).toBe('#64748b');
  });

  it('returns default for Extratropical', () => {
    expect(nhcStormColor(50, 'EX')).toBe('#94a3b8');
  });

  it('returns default for unknown classification', () => {
    expect(nhcStormColor(50, 'XX')).toBe('#94a3b8');
  });

  it('handles string intensity values', () => {
    expect(nhcStormColor('140', 'HU')).toBe('#c026d3');
  });

  it('handles zero intensity', () => {
    expect(nhcStormColor(0, 'HU')).toBe('#facc15');
  });

  it('handles TY (Typhoon) classification like HU', () => {
    expect(nhcStormColor(140, 'TY')).toBe('#c026d3');
    expect(nhcStormColor(85, 'TY')).toBe('#eab308');
  });

  it('handles SS (Subtropical Storm) like TS', () => {
    expect(nhcStormColor(45, 'SS')).toBe('#38bdf8');
  });

  it('handles SD (Subtropical Depression) like TD', () => {
    expect(nhcStormColor(25, 'SD')).toBe('#64748b');
  });

  it('handles DB/LO/WV as Disturbance (default color)', () => {
    expect(nhcStormColor(20, 'DB')).toBe('#94a3b8');
    expect(nhcStormColor(20, 'LO')).toBe('#94a3b8');
    expect(nhcStormColor(20, 'WV')).toBe('#94a3b8');
  });

  it('handles PT (Post-Tropical) as default', () => {
    expect(nhcStormColor(30, 'PT')).toBe('#94a3b8');
  });
});
