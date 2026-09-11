import { describe, it, expect } from 'vitest';
import {
  buildColorLut,
  buildGeometryLut,
  REFLECTIVITY_SCALE,
  VELOCITY_SCALE,
  SPECTRUM_WIDTH_SCALE,
  ZDR_SCALE,
  CC_SCALE,
} from '../../src/app/utils/radarRaster';

const SCALE_BY_PRODUCT = {
  reflectivity: REFLECTIVITY_SCALE,
  velocity: VELOCITY_SCALE,
  spectrumWidth: SPECTRUM_WIDTH_SCALE,
  zdr: ZDR_SCALE,
  cc: CC_SCALE,
};
// No product hides part of its range as "no data" below the first band —
// reflectivity's scale (Phase 7G, NOAA JetStream-aligned) now starts at
// -35 dBZ specifically so valid low-end values stay visible; the real
// no-data sentinel is a separate mechanism entirely (rasterizeSweep's
// noDataByte check, before colorForProduct is ever reached).
const BELOW_MIN_IS_NO_DATA = {};

// Reference implementation mirroring the pre-optimization per-pixel logic
// (hexToRgb + linear band scan), used only here to verify the LUT produces
// byte-identical colors — this is the same math rasterizeSweep used to run
// inline before it was hoisted into a precomputed table.
function referenceColor(product, realValue) {
  const scaleTable = SCALE_BY_PRODUCT[product];
  const belowMinIsNoData = Boolean(BELOW_MIN_IS_NO_DATA[product]);
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

  it('preserves valid low reflectivity (-35 to 15 dBZ) as colored, not no-data', () => {
    const scale = 0.5;
    const offset = -32;
    const lut = buildColorLut('reflectivity', scale, offset);
    // raw=0 -> real = -32 dBZ — within the -35..0 dBZ band, must be colored.
    expect(unpack(lut[0])).not.toBeNull();
  });

  it('never returns no-data for reflectivity via the below-min path, even for an extreme low value', () => {
    // scale/offset chosen so raw=0 decodes to a real value below -35 (the
    // scale's own floor) — reflectivity's belowMinIsNoData is false, so this
    // clamps to the lowest bin's color rather than becoming null. The real
    // no-data sentinel is an entirely separate mechanism (rasterizeSweep's
    // noDataByte check), not this one.
    const lut = buildColorLut('reflectivity', 1, -40);
    expect(unpack(lut[0])).not.toBeNull(); // real = -40, below the -35 floor — still colored
  });

  it('separates NOAA-mandated dBZ breakpoints into 13 visually distinct bins', () => {
    const scale = 0.5;
    const offset = -32; // matches nexradPayloadFormat.js's real QUANT_RANGE.reflectivity
    const lut = buildColorLut('reflectivity', scale, offset);
    // One representative real dBZ value per NOAA breakpoint bin.
    const representativeDbz = [-20, 8, 17, 22, 27, 32, 37, 42, 47, 52, 57, 62, 80];
    const colors = representativeDbz.map((real) => {
      const raw = Math.round((real - offset) / scale);
      return unpack(lut[Math.min(254, Math.max(0, raw))]);
    });
    const distinctColors = new Set(colors.map((c) => c.join(',')));
    expect(distinctColors.size).toBe(representativeDbz.length);
  });

  describe.each(['spectrumWidth', 'zdr', 'cc'])('%s (Phase 7G)', (product) => {
    it('matches the reference band-color logic for every possible raw byte', () => {
      // Real quantization params from nexradPayloadFormat.js's QUANT_RANGE
      // for this product, matching how encodeScanPayload derives scale/offset.
      const ranges = { spectrumWidth: [0, 40], zdr: [-13, 20], cc: [0.2, 1.06] };
      const [min, max] = ranges[product];
      const scale = (max - min) / 254;
      const offset = min;
      const lut = buildColorLut(product, scale, offset);
      for (let raw = 0; raw < 255; raw++) {
        const real = raw * scale + offset;
        expect(unpack(lut[raw])).toEqual(referenceColor(product, real));
      }
    });

    it('never treats a value within its own real range as no-data', () => {
      const ranges = { spectrumWidth: [0, 40], zdr: [-13, 20], cc: [0.2, 1.06] };
      const [min, max] = ranges[product];
      const scale = (max - min) / 254;
      const lut = buildColorLut(product, scale, min);
      // Every byte 0-254 should resolve to a real color, never null —
      // these three products are meaningful across their full range.
      for (let raw = 0; raw < 255; raw++) {
        expect(unpack(lut[raw])).not.toBeNull();
      }
    });
  });

  it('produces a genuinely different table for each of the five registered products', () => {
    const scale = 0.1;
    const offset = 0;
    const luts = ['reflectivity', 'velocity', 'spectrumWidth', 'zdr', 'cc']
      .map((product) => Array.from(buildColorLut(product, scale, offset)).join(','));
    expect(new Set(luts).size).toBe(luts.length);
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
