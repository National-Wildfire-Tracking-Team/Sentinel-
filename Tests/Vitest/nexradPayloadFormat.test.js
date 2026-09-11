import { describe, it, expect } from 'vitest';
import {
  encodeScanPayload,
  decodeScanPayload,
  PRODUCT_CODES,
  PRODUCT_NAMES,
  QUANT_RANGE,
} from '../../src/app/utils/nexradPayloadFormat';

const ALL_PRODUCTS = ['reflectivity', 'velocity', 'spectrumWidth', 'zdr', 'cc'];

function makePayload(product, { radialCount = 4, gateCount = 3 } = {}) {
  const { min, max } = QUANT_RANGE[product];
  const azimuths = Array.from({ length: radialCount }, (_, i) => (i * 360) / radialCount);
  const moments = Array.from({ length: radialCount }, (_, r) => Array.from({ length: gateCount }, (_, g) => {
    if (g === gateCount - 1) return null; // last gate of every radial is intentionally no-data
    return min + ((max - min) * (r * gateCount + g)) / (radialCount * gateCount - 1);
  }));
  return {
    siteId: 'KTLX',
    product,
    scanTimeMs: Date.UTC(2026, 8, 10, 16, 0, 0),
    elevationDeg: 0.5,
    azimuths,
    gateCount,
    gateSizeM: 250,
    firstGateM: 2125,
    moments,
  };
}

describe('nexradPayloadFormat — product registry', () => {
  it('defines a distinct code for every product, matching PRODUCT_NAMES order', () => {
    ALL_PRODUCTS.forEach((product, expectedCode) => {
      expect(PRODUCT_CODES[product]).toBe(expectedCode);
      expect(PRODUCT_NAMES[expectedCode]).toBe(product);
    });
  });

  it('defines a quantization range for every registered product', () => {
    for (const product of ALL_PRODUCTS) {
      expect(QUANT_RANGE[product]).toBeDefined();
      expect(QUANT_RANGE[product].max).toBeGreaterThan(QUANT_RANGE[product].min);
    }
  });
});

describe.each(ALL_PRODUCTS)('encodeScanPayload / decodeScanPayload — %s', (product) => {
  it('round-trips site, product, scan time, and geometry unchanged', () => {
    const params = makePayload(product);
    const buffer = encodeScanPayload(params);
    const decoded = decodeScanPayload(buffer);

    expect(decoded.siteId).toBe('KTLX');
    expect(decoded.product).toBe(product);
    expect(decoded.scanTime.getTime()).toBe(params.scanTimeMs);
    expect(decoded.elevationDeg).toBeCloseTo(0.5, 5);
    expect(decoded.radialCount).toBe(params.azimuths.length);
    expect(decoded.gateCount).toBe(params.gateCount);
    expect(decoded.gateSizeM).toBeCloseTo(250, 3);
    expect(decoded.firstGateM).toBeCloseTo(2125, 3);
  });

  it('preserves null (no-data) gates as the reserved sentinel byte', () => {
    const params = makePayload(product);
    const decoded = decodeScanPayload(encodeScanPayload(params));

    for (let r = 0; r < params.moments.length; r++) {
      const lastGateIdx = r * params.gateCount + (params.gateCount - 1);
      expect(decoded.values[lastGateIdx]).toBe(decoded.noDataByte);
    }
  });

  it('reconstructs real values within one quantization step of the original', () => {
    const params = makePayload(product);
    const decoded = decodeScanPayload(encodeScanPayload(params));
    const { min, max } = QUANT_RANGE[product];
    const step = (max - min) / 254;

    for (let r = 0; r < params.moments.length; r++) {
      for (let g = 0; g < params.gateCount - 1; g++) { // skip the intentional no-data gate
        const original = params.moments[r][g];
        const raw = decoded.values[r * params.gateCount + g];
        const reconstructed = raw * decoded.scale + decoded.offset;
        expect(Math.abs(reconstructed - original)).toBeLessThanOrEqual(step / 2 + 1e-6);
      }
    }
  });

  it('never quantizes a valid in-range value to the no-data byte', () => {
    const params = makePayload(product);
    const decoded = decodeScanPayload(encodeScanPayload(params));

    for (let r = 0; r < params.moments.length; r++) {
      for (let g = 0; g < params.gateCount - 1; g++) {
        expect(decoded.values[r * params.gateCount + g]).not.toBe(decoded.noDataByte);
      }
    }
  });
});

describe('nexradPayloadFormat — cross-product isolation', () => {
  it('two different products encoded with the same geometry decode to different product codes', () => {
    const a = decodeScanPayload(encodeScanPayload(makePayload('zdr')));
    const b = decodeScanPayload(encodeScanPayload(makePayload('cc')));
    expect(a.product).not.toBe(b.product);
    expect(a.scale).not.toBe(b.scale);
    expect(a.offset).not.toBe(b.offset);
  });
});
