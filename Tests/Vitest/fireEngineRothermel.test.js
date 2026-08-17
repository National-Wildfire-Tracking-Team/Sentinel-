import { describe, it, expect } from 'vitest';
import { getFuelModel } from '../../src/fireEngine/science/fuelModels';
import { computeSurfaceFireBehavior, estimateMoistureProfile } from '../../src/fireEngine/science/rothermel';

const shortGrass = getFuelModel(1);
const chaparral = getFuelModel(4);

function behaviorFor({ fuelModel = shortGrass, deadMoisturePct = 8, wind = 10, slope = 0 } = {}) {
  return computeSurfaceFireBehavior({
    fuelModel,
    moisture: estimateMoistureProfile(deadMoisturePct),
    midflameWindMph: wind,
    slopeSteepness: slope,
  });
}

describe('getFuelModel', () => {
  it('returns the standard 13 Anderson models by id', () => {
    for (let id = 1; id <= 13; id++) {
      const model = getFuelModel(id);
      expect(model.id).toBe(id);
      expect(model.depthFt).toBeGreaterThan(0);
      expect(model.moistureOfExtinctionDead).toBeGreaterThan(0);
    }
  });

  it('throws on an unknown fuel model id', () => {
    expect(() => getFuelModel(99)).toThrow();
  });
});

describe('computeSurfaceFireBehavior', () => {
  it('produces zero spread for a fuel model with no load', () => {
    const empty = { ...shortGrass, loadLbFt2: { oneHr: 0, tenHr: 0, hundredHr: 0, liveHerb: 0, liveWoody: 0 } };
    const result = behaviorFor({ fuelModel: empty });
    expect(result.rateOfSpreadFtMin).toBe(0);
    expect(result.flameLengthFt).toBe(0);
  });

  it('increases rate of spread with wind speed', () => {
    const calm = behaviorFor({ wind: 2 });
    const windy = behaviorFor({ wind: 25 });
    expect(windy.rateOfSpreadFtMin).toBeGreaterThan(calm.rateOfSpreadFtMin);
  });

  it('increases rate of spread with slope', () => {
    const flat = behaviorFor({ slope: 0 });
    const steep = behaviorFor({ slope: 0.6 });
    expect(steep.rateOfSpreadFtMin).toBeGreaterThan(flat.rateOfSpreadFtMin);
  });

  it('decreases rate of spread as dead fuel moisture rises toward extinction', () => {
    const dry = behaviorFor({ deadMoisturePct: 4 });
    const damp = behaviorFor({ deadMoisturePct: 11 }); // FM1 moisture of extinction is 12%
    expect(damp.rateOfSpreadFtMin).toBeLessThan(dry.rateOfSpreadFtMin);
  });

  it('fully damps spread once dead fuel moisture reaches the extinction moisture', () => {
    const result = behaviorFor({ deadMoisturePct: 12 }); // == FM1 moistureOfExtinctionDead
    expect(result.rateOfSpreadFtMin).toBe(0);
  });

  it('produces a positive, finite flame length and fireline intensity for a burning scenario', () => {
    const result = behaviorFor({ wind: 15, deadMoisturePct: 6 });
    expect(result.flameLengthFt).toBeGreaterThan(0);
    expect(Number.isFinite(result.flameLengthFt)).toBe(true);
    expect(result.firelineIntensityBtuFtS).toBeGreaterThan(0);
  });

  it('gives chaparral (higher load, deeper bed) a different spread rate than short grass under identical weather', () => {
    const grass = behaviorFor({ fuelModel: shortGrass, wind: 10, deadMoisturePct: 8 });
    const brush = behaviorFor({ fuelModel: chaparral, wind: 10, deadMoisturePct: 8 });
    expect(grass.rateOfSpreadFtMin).not.toBeCloseTo(brush.rateOfSpreadFtMin, 1);
  });

  it('keeps packing ratio and characteristic SAV within physically sane bounds', () => {
    const result = behaviorFor();
    expect(result.packingRatio).toBeGreaterThan(0);
    expect(result.packingRatio).toBeLessThan(1);
    expect(result.characteristicSav).toBeGreaterThan(0);
  });
});

describe('estimateMoistureProfile', () => {
  it('orders dead fuel moisture classes 1hr < 10hr < 100hr, matching typical lag-time behavior', () => {
    const profile = estimateMoistureProfile(6);
    expect(profile.oneHr).toBeLessThan(profile.tenHr);
    expect(profile.tenHr).toBeLessThan(profile.hundredHr);
  });

  it('defaults live fuel moisture to typical growing-season values when not supplied', () => {
    const profile = estimateMoistureProfile(6);
    expect(profile.liveHerb).toBeGreaterThan(profile.oneHr);
    expect(profile.liveWoody).toBeGreaterThan(profile.oneHr);
  });
});
