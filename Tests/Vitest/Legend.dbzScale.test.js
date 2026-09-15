import { describe, it, expect } from 'vitest';
import { RADAR_DBZ_SCALE } from '../../src/app/components/Legend/Legend';
import { REFLECTIVITY_SCALE } from '../../src/app/utils/radarRaster';

describe('RADAR_DBZ_SCALE (legend) matches REFLECTIVITY_SCALE (renderer)', () => {
  it('has exactly the 12 bins actually rendered: 20-25 through 70-75 in 5 dBZ steps, and 75+', () => {
    // REFLECTIVITY_SCALE has 15 bands from 5 dBZ up, but nothing below 20 dBZ
    // is ever rendered (radarRaster.js's NEXRAD_REFLECTIVITY_HIDE_BELOW_DBZ,
    // shared by NEXRAD Level II and Composite Radar alike) — so the legend
    // starts at the same 20 dBZ floor, not REFLECTIVITY_SCALE's own first band.
    expect(RADAR_DBZ_SCALE).toHaveLength(12);
    expect(RADAR_DBZ_SCALE[0].label).toBe('20–25 dBZ');
    expect(RADAR_DBZ_SCALE.at(-1).label).toBe('75+ dBZ');
  });

  it('never labels a bin with a rain-rate descriptor — dBZ is the only unit shown', () => {
    for (const row of RADAR_DBZ_SCALE) {
      expect(row.label).toMatch(/dBZ/);
      expect(row.label).not.toMatch(/rain|drizzle|light|moderate|heavy|intense|extreme|hail/i);
    }
  });

  it('every row uses an exact 5 dBZ range label matching REFLECTIVITY_SCALE\'s stops', () => {
    const labels = RADAR_DBZ_SCALE.map((r) => r.label);
    expect(labels).toEqual([
      '20–25 dBZ', '25–30 dBZ', '30–35 dBZ', '35–40 dBZ', '40–45 dBZ',
      '45–50 dBZ', '50–55 dBZ', '55–60 dBZ', '60–65 dBZ', '65–70 dBZ',
      '70–75 dBZ', '75+ dBZ',
    ]);
  });

  it('every legend color is pulled directly from REFLECTIVITY_SCALE, never hand-duplicated', () => {
    const rendererColors = new Set(REFLECTIVITY_SCALE.map((s) => s.color));
    for (const row of RADAR_DBZ_SCALE) {
      expect(rendererColors.has(row.color)).toBe(true);
    }
  });

  it('the "20–25 dBZ" row uses REFLECTIVITY_SCALE\'s own 20-25 dBZ color, not a fabricated one', () => {
    const band = REFLECTIVITY_SCALE.find((s) => s.min === 20);
    expect(RADAR_DBZ_SCALE[0].color).toBe(band.color);
  });

  it('the "75+ dBZ" row uses the actual last (extreme) REFLECTIVITY_SCALE color', () => {
    expect(RADAR_DBZ_SCALE.at(-1).color).toBe(REFLECTIVITY_SCALE.at(-1).color);
  });

  it('all 12 rows have mutually distinct colors', () => {
    const colors = new Set(RADAR_DBZ_SCALE.map((r) => r.color));
    expect(colors.size).toBe(12);
  });
});
