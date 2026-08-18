import { describe, it, expect } from 'vitest';
import { simulateFireGrowth, createUniformGrid, createFireGrid } from '../../src/fireEngine/index';
import { ringCentroid } from '../../src/utils/geoUtils';
import { bearingDegrees } from '../../src/fireEngine/geo';

const IGNITION = [-118.5, 34.2]; // Southern California, arbitrary

function windyGrid(windDirectionDegFrom = 270) {
  return createUniformGrid({
    fuelModelId: 4, // chaparral
    deadFuelMoisturePct: 6,
    windSpeed20ftMph: 20,
    windDirectionDegFrom,
    slopePercent: 0,
  });
}

describe('simulateFireGrowth', () => {
  it('requires either an ignition point or a perimeter ring', () => {
    expect(() => simulateFireGrowth({ grid: windyGrid() })).toThrow();
  });

  it('requires a grid', () => {
    expect(() => simulateFireGrowth({ ignitionPoint: IGNITION })).toThrow();
  });

  it('produces one valid GeoJSON polygon feature per requested horizon', () => {
    const result = simulateFireGrowth({
      ignitionPoint: IGNITION,
      grid: windyGrid(),
      horizonsHours: [1, 6],
      timeStepHours: 0.5,
    });

    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(2);
    for (const feature of result.features) {
      expect(feature.geometry.type).toBe('Polygon');
      const ring = feature.geometry.coordinates[0];
      expect(ring.length).toBeGreaterThan(3);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(feature.properties.confidence).toBeGreaterThanOrEqual(0);
      expect(feature.properties.confidence).toBeLessThanOrEqual(1);
      expect(['low', 'moderate', 'high']).toContain(feature.properties.confidenceLabel);
    }
  });

  it('grows a larger perimeter for longer horizons (cumulative growth)', () => {
    const result = simulateFireGrowth({
      ignitionPoint: IGNITION,
      grid: windyGrid(),
      horizonsHours: [1, 3, 6],
      timeStepHours: 0.5,
    });

    const areaOf = (ring) => {
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      }
      return Math.abs(area);
    };

    const areas = result.features.map((f) => areaOf(f.geometry.coordinates[0]));
    expect(areas[1]).toBeGreaterThan(areas[0]);
    expect(areas[2]).toBeGreaterThan(areas[1]);
  });

  it('elongates the fire downwind — the farthest vertex from ignition lies roughly in the downwind direction', () => {
    const windFromWest = windyGrid(270); // wind FROM the west -> fire spreads east (bearing ~90)
    const result = simulateFireGrowth({
      ignitionPoint: IGNITION,
      grid: windFromWest,
      horizonsHours: [6],
      timeStepHours: 0.5,
    });

    const ring = result.features[0].geometry.coordinates[0];
    let farthest = ring[0];
    let farthestDist = 0;
    for (const vertex of ring) {
      const d = Math.hypot(vertex[0] - IGNITION[0], vertex[1] - IGNITION[1]);
      if (d > farthestDist) {
        farthestDist = d;
        farthest = vertex;
      }
    }
    const bearingToFarthest = bearingDegrees(IGNITION, farthest);
    // Expect roughly eastward (90 deg), allow a wide tolerance since it's an ellipse, not a ray.
    const angularDiff = Math.min(Math.abs(bearingToFarthest - 90), 360 - Math.abs(bearingToFarthest - 90));
    expect(angularDiff).toBeLessThan(45);
  });

  it('accepts a mapped perimeter ring instead of a point ignition', () => {
    const centroid = IGNITION;
    const ring = [];
    for (let i = 0; i < 12; i++) {
      const angle = (2 * Math.PI * i) / 12;
      ring.push([centroid[0] + 0.01 * Math.cos(angle), centroid[1] + 0.01 * Math.sin(angle)]);
    }
    ring.push(ring[0]);

    const result = simulateFireGrowth({ perimeterRing: ring, grid: windyGrid(), horizonsHours: [1] });
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.confidence).toBeGreaterThan(0);
  });

  it('supports spatially-varying conditions via createFireGrid (not a single uniform wind/fuel everywhere)', () => {
    const grid = createFireGrid([
      { center: [-118.6, 34.2], conditions: { fuelModelId: 1, deadFuelMoisturePct: 20, windSpeed20ftMph: 2, windDirectionDegFrom: 270, slopePercent: 0 } },
      { center: [-118.4, 34.2], conditions: { fuelModelId: 4, deadFuelMoisturePct: 4, windSpeed20ftMph: 25, windDirectionDegFrom: 270, slopePercent: 0 } },
    ]);
    // Should not throw, and should produce different local behavior depending on which cell a vertex falls in.
    const result = simulateFireGrowth({ ignitionPoint: [-118.6, 34.2], grid, horizonsHours: [3] });
    expect(result.features).toHaveLength(1);
  });
});
