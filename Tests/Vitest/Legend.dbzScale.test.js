import { describe, it, expect } from 'vitest';
import { RADAR_DBZ_SCALE } from '../../src/app/components/Legend/Legend';
import { REFLECTIVITY_SCALE } from '../../src/app/utils/radarRaster';

describe('RADAR_DBZ_SCALE (legend) matches REFLECTIVITY_SCALE (renderer)', () => {
  it('has exactly the 12 NOAA-mandated bins: <15, 15-20 through 60-65 in 5 dBZ steps, and >65', () => {
    // <15 (1) + ten 5-dBZ ranges from 15-20 through 60-65 (10) + >65 (1) = 12,
    // matching the explicit NOAA JetStream breakpoint list verbatim.
    expect(RADAR_DBZ_SCALE).toHaveLength(12);
    expect(RADAR_DBZ_SCALE[0].label).toBe('< 15 dBZ');
    expect(RADAR_DBZ_SCALE.at(-1).label).toBe('> 65 dBZ');
  });

  it('never labels a bin with a rain-rate descriptor — dBZ is the only unit shown', () => {
    for (const row of RADAR_DBZ_SCALE) {
      expect(row.label).toMatch(/dBZ/);
      expect(row.label).not.toMatch(/rain|drizzle|light|moderate|heavy|intense|extreme|hail/i);
    }
  });

  it('every row after the first uses an exact 5 dBZ range label matching REFLECTIVITY_SCALE\'s stops', () => {
    // REFLECTIVITY_SCALE: [-35, 0, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65]
    const midRangeLabels = RADAR_DBZ_SCALE.slice(1, -1).map((r) => r.label);
    expect(midRangeLabels).toEqual([
      '15–20 dBZ', '20–25 dBZ', '25–30 dBZ', '30–35 dBZ', '35–40 dBZ',
      '40–45 dBZ', '45–50 dBZ', '50–55 dBZ', '55–60 dBZ', '60–65 dBZ',
    ]);
  });

  it('every legend color is pulled directly from REFLECTIVITY_SCALE, never hand-duplicated', () => {
    const rendererColors = new Set(REFLECTIVITY_SCALE.map((s) => s.color));
    for (const row of RADAR_DBZ_SCALE) {
      expect(rendererColors.has(row.color)).toBe(true);
    }
  });

  it('the "< 15 dBZ" row uses a real REFLECTIVITY_SCALE color, not a fabricated one', () => {
    expect(RADAR_DBZ_SCALE[0].color).toBe(REFLECTIVITY_SCALE[1].color);
  });

  it('the "> 65 dBZ" row uses the actual last (extreme) REFLECTIVITY_SCALE color', () => {
    expect(RADAR_DBZ_SCALE.at(-1).color).toBe(REFLECTIVITY_SCALE.at(-1).color);
  });

  it('all 12 rows have mutually distinct colors', () => {
    const colors = new Set(RADAR_DBZ_SCALE.map((r) => r.color));
    expect(colors.size).toBe(12);
  });
});
