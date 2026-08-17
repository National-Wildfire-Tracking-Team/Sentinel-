/**
 * fireEngine/index.js
 * Public entry point for the Rothermel-based fire behavior modeling engine.
 * See docs/fire-engine/ARCHITECTURE.md for the full design, scientific
 * citations, and honesty flags on which pieces are established physics vs.
 * empirical approximation vs. heuristic.
 *
 * This engine is intentionally separate from src/utils/fireBehaviorModel.js
 * (the shipped Pro/Team map layer's lightweight model) — see the
 * architecture doc §0 for why. simulateFireGrowth() below is the "minimal
 * end-to-end simulation" deliverable: ignition point or perimeter + fuel
 * model + slope/wind/moisture (via a grid) -> forecast perimeters.
 */

import { ringCentroid } from '../utils/geoUtils';
import { growPerimeter, createIgnitionRing } from './simulation/perimeterGrowth';
import { computeConfidence } from './confidence';
import { estimateMaxSpotDistance } from './spotting';

export { createUniformGrid, createFireGrid } from './simulation/grid';
export { getFuelModel, listFuelModels, ANDERSON_FUEL_MODELS } from './science/fuelModels';
export { computeSurfaceFireBehavior, estimateMoistureProfile } from './science/rothermel';
export { assessCrownFire, criticalIntensityForCrowning } from './science/crownFire';
export { estimateMaxSpotDistance } from './spotting';
export { computeConfidence } from './confidence';
export { growPerimeter, createIgnitionRing } from './simulation/perimeterGrowth';
export { evaluateCellBehavior } from './simulation/evaluateCell';
export {
  deriveLengthToBreadthRatio,
  eccentricityFromLB,
  radialRateOfSpread,
} from './simulation/fireEllipse';

const DEFAULT_HORIZONS_HOURS = [1, 3, 6, 12, 24];

function round1(x) {
  return Math.round(x * 10) / 10;
}

function sampleWindForSpotting(grid, ring) {
  const centroid = ringCentroid(ring) || ring[0];
  const conditions = grid.sampleAt(centroid);
  return conditions.windSpeed20ftMph;
}

/**
 * @typedef {object} DataQuality
 * @property {boolean} [fuelModelIsReal]
 * @property {number}  [windObservationAgeMin]
 * @property {number}  [windStationDistanceMi]
 * @property {boolean} [moistureIsMeasured]
 * @property {boolean} [terrainIsReal]
 */

/**
 * Simulate fire growth from either a mapped perimeter or a point ignition,
 * returning forecast perimeters at each requested horizon as a GeoJSON
 * FeatureCollection (spec §12). Growth is continuous/cumulative — the 3h
 * forecast grows from the 1h forecast's shape rather than restarting from
 * ignition each time — so per-horizon conditions changes compose correctly
 * (spec §7).
 *
 * @param {object} params
 * @param {[number, number]} [params.ignitionPoint]  [lng, lat], required if no perimeterRing
 * @param {number[][]} [params.perimeterRing]         Closed exterior ring, required if no ignitionPoint
 * @param {import('./simulation/grid').FireGrid} params.grid
 * @param {number[]} [params.horizonsHours]
 * @param {number} [params.timeStepHours]
 * @param {DataQuality} [params.dataQuality]
 * @returns {{ type: 'FeatureCollection', features: object[] }}
 */
export function simulateFireGrowth({
  ignitionPoint,
  perimeterRing,
  grid,
  horizonsHours = DEFAULT_HORIZONS_HOURS,
  timeStepHours = 1,
  dataQuality = {},
}) {
  if (!perimeterRing && !ignitionPoint) {
    throw new Error('simulateFireGrowth requires either perimeterRing or ignitionPoint');
  }
  if (!grid || typeof grid.sampleAt !== 'function') {
    throw new Error('simulateFireGrowth requires a grid (see createUniformGrid/createFireGrid)');
  }

  const baseRing = perimeterRing || createIgnitionRing(ignitionPoint);

  const confidence = computeConfidence({
    fuelModelIsReal: dataQuality.fuelModelIsReal ?? !grid.isUniform,
    windObservationAgeMin: dataQuality.windObservationAgeMin ?? 60,
    windStationDistanceMi: dataQuality.windStationDistanceMi ?? 20,
    moistureIsMeasured: dataQuality.moistureIsMeasured ?? false,
    terrainIsReal: dataQuality.terrainIsReal ?? false,
    perimeterIsMapped: Boolean(perimeterRing),
  });

  const sortedHorizons = [...horizonsHours].sort((a, b) => a - b);
  const features = [];

  let currentRing = baseRing;
  let elapsedHours = 0;
  for (const horizon of sortedHorizons) {
    const remaining = horizon - elapsedHours;
    if (remaining <= 0) continue;

    const result = growPerimeter({ ring: currentRing, grid, hours: remaining, timeStepHours });
    currentRing = result.polygon.coordinates[0];
    elapsedHours = horizon;

    const spotting = estimateMaxSpotDistance({
      flameLengthFt: result.maxFlameLengthFt,
      windSpeedMph: sampleWindForSpotting(grid, currentRing),
    });

    features.push({
      type: 'Feature',
      geometry: result.polygon,
      properties: {
        horizonHours: horizon,
        maxRateOfSpreadChainsHr: round1(result.maxRateOfSpreadChainsHr),
        maxFlameLengthFt: round1(result.maxFlameLengthFt),
        maxFirelineIntensityBtuFtS: round1(result.maxFirelineIntensityBtuFtS),
        maxSpotDistanceMi: round1(spotting.maxSpotDistanceMi),
        spotDistanceIsHeuristic: true,
        confidence: confidence.score,
        confidenceLabel: confidence.label,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
