import { describe, it, expect } from 'vitest';
import {
  deriveLengthToBreadthRatio,
  eccentricityFromLB,
  backingRateOfSpread,
  radialRateOfSpread,
} from '../../src/fireEngine/simulation/fireEllipse';
import { criticalIntensityForCrowning, assessCrownFire } from '../../src/fireEngine/science/crownFire';
import { estimateMaxSpotDistance } from '../../src/fireEngine/spotting';

describe('fireEllipse', () => {
  it('returns a circle (LB=1) at zero wind', () => {
    expect(deriveLengthToBreadthRatio(0)).toBe(1);
    expect(eccentricityFromLB(1)).toBe(0);
  });

  it('elongates the ellipse as wind increases, capped at 8:1', () => {
    expect(deriveLengthToBreadthRatio(10)).toBeGreaterThan(deriveLengthToBreadthRatio(2));
    expect(deriveLengthToBreadthRatio(1000)).toBe(8);
  });

  it('radial ROS reduces to head ROS downwind and backing ROS upwind', () => {
    const lb = deriveLengthToBreadthRatio(15);
    const e = eccentricityFromLB(lb);
    const head = 100;
    const back = backingRateOfSpread(head, e);

    const downwind = radialRateOfSpread({ headRateOfSpread: head, eccentricity: e, bearingDeg: 90, spreadBearingDeg: 90 });
    const upwind = radialRateOfSpread({ headRateOfSpread: head, eccentricity: e, bearingDeg: 270, spreadBearingDeg: 90 });

    expect(downwind).toBeCloseTo(head, 5);
    expect(upwind).toBeCloseTo(back, 5);
    expect(back).toBeLessThan(head);
  });

  it('flank spread is between head and back rate', () => {
    const lb = deriveLengthToBreadthRatio(15);
    const e = eccentricityFromLB(lb);
    const flank = radialRateOfSpread({ headRateOfSpread: 100, eccentricity: e, bearingDeg: 0, spreadBearingDeg: 90 });
    const back = backingRateOfSpread(100, e);
    expect(flank).toBeGreaterThan(back);
    expect(flank).toBeLessThan(100);
  });
});

describe('crownFire', () => {
  it('requires a higher critical intensity for taller canopy base height', () => {
    const low = criticalIntensityForCrowning(1, 100);
    const high = criticalIntensityForCrowning(5, 100);
    expect(high).toBeGreaterThan(low);
  });

  it('does not initiate crowning when there is no canopy', () => {
    const result = assessCrownFire({
      surfaceFirelineIntensityBtuFtS: 5000,
      canopyBaseHeightM: 0,
      foliarMoistureContentPct: 100,
      rateOfSpreadFuelModel10FtMin: 20,
    });
    expect(result.crowningInitiates).toBe(false);
    expect(result.crownRateOfSpreadFtMin).toBeNull();
  });

  it('initiates crowning when surface intensity exceeds the critical threshold', () => {
    const result = assessCrownFire({
      surfaceFirelineIntensityBtuFtS: 5000, // ~17,300 kW/m
      canopyBaseHeightM: 1,
      foliarMoistureContentPct: 100,
      rateOfSpreadFuelModel10FtMin: 20,
    });
    expect(result.crowningInitiates).toBe(true);
    expect(result.crownRateOfSpreadFtMin).toBeCloseTo(20 * 3.34, 5);
  });
});

describe('spotting (heuristic)', () => {
  it('is explicitly labeled as a heuristic, not a physical model', () => {
    const result = estimateMaxSpotDistance({ flameLengthFt: 50, windSpeedMph: 20 });
    expect(result.isHeuristic).toBe(true);
  });

  it('increases with both flame length and wind speed', () => {
    const base = estimateMaxSpotDistance({ flameLengthFt: 20, windSpeedMph: 10 });
    const hotterFire = estimateMaxSpotDistance({ flameLengthFt: 80, windSpeedMph: 10 });
    const windier = estimateMaxSpotDistance({ flameLengthFt: 20, windSpeedMph: 30 });
    expect(hotterFire.maxSpotDistanceMi).toBeGreaterThan(base.maxSpotDistanceMi);
    expect(windier.maxSpotDistanceMi).toBeGreaterThan(base.maxSpotDistanceMi);
  });
});
