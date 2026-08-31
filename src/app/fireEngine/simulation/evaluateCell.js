/**
 * evaluateCell.js
 * Bridges a grid cell's raw conditions (fuel model id, single moisture
 * reading, 20-ft wind, slope %) into the Rothermel model's inputs and back
 * into a convenient result. This is the only place that wires
 * science/fuelModels, science/windAdjustment, and science/rothermel
 * together — kept separate from perimeterGrowth.js so it can be unit tested
 * (and reused by a future raster-painting code path) independent of any
 * geometry.
 */

import { getFuelModel } from '../science/fuelModels';
import { computeSurfaceFireBehavior, estimateMoistureProfile } from '../science/rothermel';
import { midflameWindSpeed } from '../science/windAdjustment';

/**
 * @param {import('./grid').CellConditions} conditions
 * @returns {import('../science/rothermel').SurfaceFireBehavior & { midflameWindMph: number, windDirectionDegFrom: number }}
 */
export function evaluateCellBehavior(conditions) {
  const fuelModel = getFuelModel(conditions.fuelModelId);
  const moisture = estimateMoistureProfile(conditions.deadFuelMoisturePct, {
    liveHerbPct: conditions.liveHerbMoisturePct,
    liveWoodyPct: conditions.liveWoodyMoisturePct,
  });
  const { midflameWindMph } = midflameWindSpeed({
    windSpeed20ftMph: conditions.windSpeed20ftMph,
    fuelBedDepthFt: fuelModel.depthFt,
    canopyHeightFt: conditions.canopyHeightFt,
    canopyCoverFraction: conditions.canopyCoverFraction,
  });
  const slopeSteepness = (conditions.slopePercent || 0) / 100;

  const behavior = computeSurfaceFireBehavior({ fuelModel, moisture, midflameWindMph, slopeSteepness });

  return {
    ...behavior,
    midflameWindMph,
    windDirectionDegFrom: conditions.windDirectionDegFrom,
  };
}
