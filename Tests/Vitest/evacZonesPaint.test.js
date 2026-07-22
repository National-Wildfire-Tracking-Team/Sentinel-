import { describe, it, expect } from 'vitest';
import {
  EVAC_ZONE_FILL_OPACITY,
  EVAC_ZONE_FILL_COLORS,
  EVAC_ZONE_LINE_OPACITY,
} from '../../src/components/Map/layers/evacZonesPaint';

const SEVERITIES = [
  'Evacuation Order',
  'Evacuation Warning',
  'Evacuation Watch',
  'default',
];

const LEGACY_HIGH_OPACITIES = [0.6, 0.5, 0.4, 0.45];

describe('EVAC_ZONE_FILL_OPACITY', () => {
  it('keeps every severity within 0.05–0.15', () => {
    for (const key of SEVERITIES) {
      const v = EVAC_ZONE_FILL_OPACITY[key];
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(0.15);
    }
  });

  it('preserves Order ≥ Warning ≥ Watch hierarchy', () => {
    expect(EVAC_ZONE_FILL_OPACITY['Evacuation Order']).toBeGreaterThanOrEqual(
      EVAC_ZONE_FILL_OPACITY['Evacuation Warning'],
    );
    expect(EVAC_ZONE_FILL_OPACITY['Evacuation Warning']).toBeGreaterThanOrEqual(
      EVAC_ZONE_FILL_OPACITY['Evacuation Watch'],
    );
  });

  it('matches contract target values', () => {
    expect(EVAC_ZONE_FILL_OPACITY['Evacuation Order']).toBe(0.10);
    expect(EVAC_ZONE_FILL_OPACITY['Evacuation Warning']).toBe(0.08);
    expect(EVAC_ZONE_FILL_OPACITY['Evacuation Watch']).toBe(0.06);
    expect(EVAC_ZONE_FILL_OPACITY.default).toBe(0.07);
  });

  it('does not use pre-fix high opacities', () => {
    const values = SEVERITIES.map((k) => EVAC_ZONE_FILL_OPACITY[k]);
    for (const legacy of LEGACY_HIGH_OPACITIES) {
      expect(values).not.toContain(legacy);
    }
    // Also reject the first transparency pass values that were still too heavy
    for (const mid of [0.22, 0.18, 0.14, 0.16]) {
      expect(values).not.toContain(mid);
    }
  });
});

describe('EVAC_ZONE_FILL_COLORS', () => {
  it('keeps severity colors distinguishable', () => {
    expect(EVAC_ZONE_FILL_COLORS['Evacuation Order']).toBe('#ef4444');
    expect(EVAC_ZONE_FILL_COLORS['Evacuation Warning']).toBe('#f97316');
    expect(EVAC_ZONE_FILL_COLORS['Evacuation Watch']).toBe('#eab308');
  });
});

describe('EVAC_ZONE_LINE_OPACITY', () => {
  it('keeps outlines strong (≥ 0.85)', () => {
    expect(EVAC_ZONE_LINE_OPACITY).toBeGreaterThanOrEqual(0.85);
  });
});
