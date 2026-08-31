import { describe, it, expect } from 'vitest';
import { geometryAreaSqMi } from '../../src/app/utils/geoArea';

describe('geometryAreaSqMi', () => {
  it('returns null for null geometry', () => {
    expect(geometryAreaSqMi(null)).toBeNull();
  });

  it('returns null for unknown geometry type', () => {
    expect(geometryAreaSqMi({ type: 'LineString', coordinates: [] })).toBeNull();
  });

  it('computes area for a Polygon', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [-120, 37],
          [-119, 37],
          [-119, 38],
          [-120, 38],
          [-120, 37],
        ],
      ],
    };
    const area = geometryAreaSqMi(geometry);
    expect(area).toBeGreaterThan(0);
    expect(typeof area).toBe('number');
  });

  it('computes area for a MultiPolygon', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [-120, 37],
            [-119, 37],
            [-119, 38],
            [-120, 38],
            [-120, 37],
          ],
        ],
        [
          [
            [-118, 34],
            [-117, 34],
            [-117, 35],
            [-118, 35],
            [-118, 34],
          ],
        ],
      ],
    };
    const area = geometryAreaSqMi(geometry);
    expect(area).toBeGreaterThan(0);
  });

  it('returns null for empty coordinates', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [],
    };
    expect(geometryAreaSqMi(geometry)).toBeNull();
  });

  it('returns null for degenerate polygon (zero area)', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      ],
    };
    expect(geometryAreaSqMi(geometry)).toBeNull();
  });
});
