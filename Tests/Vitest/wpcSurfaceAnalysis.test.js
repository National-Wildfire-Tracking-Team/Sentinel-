import { describe, it, expect } from 'vitest';
import { decodePosition, parseCodedSurface } from '../../src/app/api/wpcSurfaceAnalysis';

// Excerpt of a real high-resolution CODSUS issue (records wrap onto following lines).
const BULLETIN = `<html><body><pre>
CODED SURFACE FRONTAL POSITIONS
NWS WEATHER PREDICTION CENTER COLLEGE PARK MD
1226 PM EDT FRI OCT 16 2026

VALID 101615Z
HIGHS 1046 3861040 1046 4261031 1044 4541137 1038 4061144 1029 6591022 1013
5230670 1026 3801315
LOWS 998 4560736 992 6460547
COLD 4370776 4020802 3580847 3350887
WARM 4370776 4300772 4110780 3990778
STNRY 3360671 3400684 3490699
OCFNT 4560736 4470754 4370776
TROF 1892 1993 2394
XYZ 4370776 4020802

$$
</pre></body></html>`;

describe('decodePosition', () => {
  it('reads tenth-degree and whole-degree positions as west longitude', () => {
    expect(decodePosition('4370776')).toEqual([-77.6, 43.7]);
    expect(decodePosition('6461514')).toEqual([-151.4, 64.6]);
    expect(decodePosition('4478')).toEqual([-78, 44]);
    expect(decodePosition('39104')).toEqual([-104, 39]);
    expect(decodePosition('$$')).toBeNull();
  });
});

describe('parseCodedSurface', () => {
  const now = Date.UTC(2026, 9, 16, 16, 30);
  const out = parseCodedSurface(BULLETIN, now);

  it('reads the valid time', () => {
    expect(new Date(out.validTime).toISOString()).toBe('2026-10-16T15:00:00.000Z');
  });

  it('reads every high and low with its central pressure, across wrapped lines', () => {
    const highs = out.centers.features.filter((f) => f.properties.kind === 'H');
    const lows = out.centers.features.filter((f) => f.properties.kind === 'L');
    expect(highs).toHaveLength(7);
    expect(highs[5].properties.pressure).toBe(1013);
    expect(highs[5].geometry.coordinates).toEqual([-67, 52.3]); // the pair split over two lines
    expect(lows.map((f) => f.properties.pressure)).toEqual([998, 992]);
    expect(lows[0].geometry.coordinates).toEqual([-73.6, 45.6]);
  });

  it('reads fronts in their listed order (symbols face left of that order) and skips unknown records', () => {
    const types = out.fronts.features.map((f) => f.properties.frontType);
    expect(types).toEqual(['COLD', 'WARM', 'STATIONARY', 'OCCLUDED', 'TROUGH']);
    const cold = out.fronts.features[0].geometry.coordinates;
    expect(cold[0]).toEqual([-77.6, 43.7]);
    expect(cold.at(-1)).toEqual([-88.7, 33.5]);
    expect(out.fronts.features[4].geometry.coordinates[0]).toEqual([-92, 18]); // low-res trough
  });
});
