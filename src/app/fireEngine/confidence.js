/**
 * confidence.js
 * Uncertainty/confidence scoring — a weighted data-quality checklist, NOT a
 * statistical confidence interval. See docs/fire-engine/ARCHITECTURE.md §6
 * for the methodology and why it's intentionally coarse. The goal is to
 * avoid false precision (spec requirement: "avoid giving users false
 * precision"), not to produce a defensible error bound.
 */

const WEIGHTS = {
  fuelModelIsReal: 0.25,
  windIsFresh: 0.25,
  moistureIsMeasured: 0.20,
  terrainIsReal: 0.15,
  perimeterIsMapped: 0.15,
};

/**
 * @param {object} inputs
 * @param {boolean} inputs.fuelModelIsReal        Per-cell real fuel model vs. a single default applied everywhere
 * @param {number}  inputs.windObservationAgeMin  Minutes since the wind observation/forecast valid time
 * @param {number}  inputs.windStationDistanceMi  Distance to the wind source
 * @param {boolean} inputs.moistureIsMeasured     Measured (RAWS/NFDRS) vs. climatological default
 * @param {boolean} inputs.terrainIsReal          Real slope/aspect vs. flat-ground assumption
 * @param {boolean} inputs.perimeterIsMapped      Mapped perimeter vs. point-ignition guess
 * @returns {{ score: number, label: 'low'|'moderate'|'high', factors: Record<string, number> }}
 */
export function computeConfidence(inputs) {
  const windIsFresh = inputs.windObservationAgeMin <= 30 && inputs.windStationDistanceMi <= 10 ? 1
    : inputs.windObservationAgeMin <= 120 && inputs.windStationDistanceMi <= 30 ? 0.5
    : 0.15;

  const factors = {
    fuelModelIsReal: inputs.fuelModelIsReal ? 1 : 0.2,
    windIsFresh,
    moistureIsMeasured: inputs.moistureIsMeasured ? 1 : 0.3,
    terrainIsReal: inputs.terrainIsReal ? 1 : 0.4,
    perimeterIsMapped: inputs.perimeterIsMapped ? 1 : 0.35,
  };

  const score = Object.keys(WEIGHTS).reduce((sum, key) => sum + WEIGHTS[key] * factors[key], 0);
  const label = score >= 0.75 ? 'high' : score >= 0.45 ? 'moderate' : 'low';

  return { score: Math.round(score * 100) / 100, label, factors };
}
