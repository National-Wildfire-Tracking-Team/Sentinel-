import { describe, it, expect } from 'vitest';
import { findNearestStation, estimateFireBehavior, buildSpreadPolygon } from './fireBehaviorModel';

describe('findNearestStation', () => {
  const stations = [
    { geometry: { coordinates: [-114.0, 44.0] }, properties: { windSpeed: 10, fuelMoisture: 8 } },
    { geometry: { coordinates: [-114.5, 44.5] }, properties: { windSpeed: 5, fuelMoisture: 15 } },
  ];

  it('returns the closest station within range', () => {
    const result = findNearestStation([-114.01, 44.01], stations);
    expect(result.station).toBe(stations[0]);
    expect(result.distanceMi).toBeLessThan(5);
  });

  it('returns null when nothing is within range', () => {
    expect(findNearestStation([-100, 30], stations)).toBeNull();
  });

  it('returns null for empty/missing input', () => {
    expect(findNearestStation([-114, 44], [])).toBeNull();
    expect(findNearestStation(null, stations)).toBeNull();
  });

  it('skips stations with no usable wind/fuel-moisture data', () => {
    const noData = [{ geometry: { coordinates: [-114.0, 44.0] }, properties: { windSpeed: null, fuelMoisture: null } }];
    expect(findNearestStation([-114.0, 44.0], noData)).toBeNull();
  });
});

describe('estimateFireBehavior', () => {
  it('falls back to defaults when wind/fuel moisture are missing', () => {
    const result = estimateFireBehavior({});
    expect(result.windSpeedMph).toBeGreaterThan(0);
    expect(result.fuelMoisturePct).toBeGreaterThan(0);
    expect(result.rosHeadChPerHr).toBeGreaterThan(0);
  });

  it('increases head rate of spread as wind increases', () => {
    const calm = estimateFireBehavior({ windSpeedMph: 2, fuelMoisturePct: 10 });
    const windy = estimateFireBehavior({ windSpeedMph: 25, fuelMoisturePct: 10 });
    expect(windy.rosHeadChPerHr).toBeGreaterThan(calm.rosHeadChPerHr);
    expect(windy.lengthWidthRatio).toBeGreaterThan(calm.lengthWidthRatio);
  });

  it('decreases spread rate as fuel moisture increases', () => {
    const dry = estimateFireBehavior({ windSpeedMph: 10, fuelMoisturePct: 4 });
    const damp = estimateFireBehavior({ windSpeedMph: 10, fuelMoisturePct: 28 });
    expect(damp.rosHeadChPerHr).toBeLessThan(dry.rosHeadChPerHr);
  });

  it('keeps head spread rate greater than or equal to backing rate', () => {
    const result = estimateFireBehavior({ windSpeedMph: 15, fuelMoisturePct: 10 });
    expect(result.rosHeadChPerHr).toBeGreaterThanOrEqual(result.rosBackChPerHr);
  });

  it('produces a positive flame length', () => {
    const result = estimateFireBehavior({ windSpeedMph: 10, fuelMoisturePct: 10 });
    expect(result.flameLengthFt).toBeGreaterThan(0);
  });
});

describe('buildSpreadPolygon', () => {
  it('returns a closed polygon ring', () => {
    const behavior = estimateFireBehavior({ windSpeedMph: 10, fuelMoisturePct: 10 });
    const polygon = buildSpreadPolygon({ ignition: [-114, 44], windDirDeg: 270, behavior, hours: 3 });
    expect(polygon.type).toBe('Polygon');
    const ring = polygon.coordinates[0];
    expect(ring.length).toBeGreaterThan(3);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('grows larger over longer time horizons', () => {
    const behavior = estimateFireBehavior({ windSpeedMph: 10, fuelMoisturePct: 10 });
    const areaOf = (hours) => {
      const ring = buildSpreadPolygon({ ignition: [-114, 44], windDirDeg: 270, behavior, hours }).coordinates[0];
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      }
      return Math.abs(area);
    };
    expect(areaOf(6)).toBeGreaterThan(areaOf(1));
  });
});
