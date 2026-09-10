import { describe, it, expect } from 'vitest';
import {
  buildColorLut,
  buildGeometryLut,
  REFLECTIVITY_SCALE,
  VELOCITY_SCALE,
} from '../../src/app/utils/radarRaster';

// Reference implementation mirroring the pre-optimization per-pixel logic
// (hexToRgb + linear band scan), used only here to verify the LUT produces
// byte-identical colors — this is the same math rasterizeSweep used to run
// inline before it was hoisted into a precomputed table.
function referenceColor(product, realValue) {
  const scaleTable = product === 'reflectivity' ? REFLECTIVITY_SCALE : VELOCITY_SCALE;
  const belowMinIsNoData = product === 'reflectivity';
  if (belowMinIsNoData && realValue < scaleTable[0].min) return null;
  let match = scaleTable[0];
  for (const stop of scaleTable) {
    if (realValue >= stop.min) match = stop;
  }
  const n = parseInt(match.color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function unpack(packed) {
  if (!(packed & (1 << 24))) return null;
  return [packed & 255, (packed >> 8) & 255, (packed >> 16) & 255];
}

describe('buildColorLut', () => {
  it('matches the reference band-color logic for every possible raw byte, reflectivity', () => {
    const scale = 0.5;
    const offset = -32;
    const lut = buildColorLut('reflectivity', scale, offset);
    for (let raw = 0; raw < 255; raw++) {
      const real = raw * scale + offset;
      expect(unpack(lut[raw])).toEqual(referenceColor('reflectivity', real));
    }
  });

  it('matches the reference band-color logic for every possible raw byte, velocity', () => {
    const scale = 200 / 254;
    const offset = -100;
    const lut = buildColorLut('velocity', scale, offset);
    for (let raw = 0; raw < 255; raw++) {
      const real = raw * scale + offset;
      expect(unpack(lut[raw])).toEqual(referenceColor('velocity', real));
    }
  });

  it('marks reflectivity values below the first band as no-data (transparent)', () => {
    const scale = 0.5;
    const offset = -32;
    const lut = buildColorLut('reflectivity', scale, offset);
    // raw=0 -> real = -32 dBZ, well under the 15 dBZ floor.
    expect(unpack(lut[0])).toBeNull();
  });

  it('is deterministic — identical inputs produce identical tables', () => {
    const a = buildColorLut('reflectivity', 0.5, -32);
    const b = buildColorLut('reflectivity', 0.5, -32);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

// Real values observed from production KMLB reflectivity scans (Phase 7A/7B),
// so the dead-zone/out-of-range math below reflects an actual sweep's scale.
const REAL_MAX_RANGE_M = 460125;
const REAL_FIRST_GATE_M = 2125;
const REAL_CANVAS_SIZE = 768;

describe('buildGeometryLut', () => {
  it('excludes pixels closer than firstGateM (dead zone around the site)', () => {
    const { inRange } = buildGeometryLut(REAL_MAX_RANGE_M, REAL_FIRST_GATE_M, REAL_CANVAS_SIZE);
    // The four pixels straddling the true center are the closest possible to
    // the site (~1198m at this scale) — well inside the ~2125m dead zone.
    const half = REAL_CANVAS_SIZE / 2;
    const centerIdx = half * REAL_CANVAS_SIZE + half;
    expect(inRange[centerIdx]).toBe(0);
  });

  it('excludes pixels beyond maxRangeM (corners of a circular sweep)', () => {
    const { inRange } = buildGeometryLut(REAL_MAX_RANGE_M, REAL_FIRST_GATE_M, REAL_CANVAS_SIZE);
    // Top-left corner pixel is at the canvas's maximum radius from center —
    // for a square canvas circumscribing the circular sweep, corners fall
    // outside maxRangeM.
    expect(inRange[0]).toBe(0);
  });

  it('computes range and azimuth matching direct trigonometry for an in-range pixel', () => {
    const canvasSize = REAL_CANVAS_SIZE;
    const maxRangeM = REAL_MAX_RANGE_M;
    const firstGateM = REAL_FIRST_GATE_M;
    const { rangeArr, azArr, inRange } = buildGeometryLut(maxRangeM, firstGateM, canvasSize);

    const metersPerPixel = (2 * maxRangeM) / canvasSize;
    const half = canvasSize / 2;
    // Pick a pixel just right of center — inside the near dead-zone boundary,
    // but easy to hand-verify independently.
    const px = half + 3;
    const py = half;
    const i = py * canvasSize + px;
    const xMeters = (px - half + 0.5) * metersPerPixel;
    const yMeters = (half - py - 0.5) * metersPerPixel;
    const expectedRange = Math.hypot(xMeters, yMeters);
    const expectedAz = (Math.atan2(xMeters, yMeters) * 180 / Math.PI + 360) % 360;

    expect(rangeArr[i]).toBeCloseTo(expectedRange, 6);
    if (inRange[i]) {
      expect(azArr[i]).toBeCloseTo(expectedAz, 6);
    }
  });

  it('is deterministic and independent of call order (same key -> same values)', () => {
    const a = buildGeometryLut(100000, 2125, 16);
    const b = buildGeometryLut(100000, 2125, 16);
    expect(Array.from(a.rangeArr)).toEqual(Array.from(b.rangeArr));
    expect(Array.from(a.azArr)).toEqual(Array.from(b.azArr));
    expect(Array.from(a.inRange)).toEqual(Array.from(b.inRange));
  });

  it('produces a different table for a different maxRangeM (product isolation)', () => {
    const reflectivityLike = buildGeometryLut(460125, 2125, 16);
    const velocityLike = buildGeometryLut(300125, 2125, 16);
    expect(Array.from(reflectivityLike.rangeArr)).not.toEqual(Array.from(velocityLike.rangeArr));
  });
});
