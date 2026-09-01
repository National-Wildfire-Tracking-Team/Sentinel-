import { describe, it, expect } from 'vitest';
import { ringCentroid, polygonCentroid } from '../../src/app/utils/geoUtils';

describe('ringCentroid', () => {
  it('returns null for ring with < 3 points', () => {
    expect(ringCentroid([])).toBeNull();
    expect(ringCentroid([[0, 0]])).toBeNull();
    expect(ringCentroid([[0, 0], [1, 1]])).toBeNull();
  });

  it('computes centroid of a simple triangle', () => {
    const ring = [
      [0, 0],
      [4, 0],
      [2, 3],
      [0, 0],
    ];
    const [lng, lat] = ringCentroid(ring);
    expect(lng).toBeCloseTo(2, 1);
    expect(lat).toBeCloseTo(1, 1);
  });

  it('computes centroid of a square', () => {
    const ring = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    const [lng, lat] = ringCentroid(ring);
    expect(lng).toBeCloseTo(2, 1);
    expect(lat).toBeCloseTo(2, 1);
  });

  it('returns null for degenerate polygon (zero area)', () => {
    const ring = [
      [0, 0],
      [1, 1],
      [2, 2],
      [0, 0],
    ];
    expect(ringCentroid(ring)).toBeNull();
  });
});

describe('polygonCentroid', () => {
  it('returns null for null geometry', () => {
    expect(polygonCentroid(null)).toBeNull();
  });

  it('returns null for unknown geometry type', () => {
    expect(polygonCentroid({ type: 'Point', coordinates: [0, 0] })).toBeNull();
  });

  it('computes centroid for a Polygon', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
      ],
    };
    const [lng, lat] = polygonCentroid(geometry);
    expect(lng).toBeCloseTo(2, 1);
    expect(lat).toBeCloseTo(2, 1);
  });

  it('computes centroid for a MultiPolygon using largest sub-polygon', () => {
    const geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [10, 10],
            [14, 10],
            [14, 14],
            [10, 14],
            [10, 14],
            [10, 10],
          ],
        ],
      ],
    };
    const [lng, lat] = polygonCentroid(geometry);
    expect(lng).toBeCloseTo(12, 0);
    expect(lat).toBeCloseTo(12, 0);
  });
});
