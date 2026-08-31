/**
 * spotting.js
 * HEURISTIC ONLY — not a physical spotting model.
 *
 * A real ember-transport model (Albini 1979's torching-tree/burning-pile
 * nomographs, or modern plume/ballistic approaches like Koo et al. 2010)
 * requires solving firebrand lofting height in a convective plume and then a
 * ballistic trajectory through a wind profile, per firebrand size/shape
 * class. That is a research-grade subsystem in its own right and is
 * explicitly NOT implemented here.
 *
 * What follows is a coarse, monotonic "how far could embers plausibly carry"
 * estimate for situational-awareness UI only (e.g. "watch for spot fires up
 * to ~1.2 mi downwind"), built from the qualitative relationships the
 * literature agrees on — spot distance increases with fire intensity (via
 * flame length) and with wind speed — using an arbitrary calibration
 * constant, NOT a fitted or published coefficient. Do not present this as a
 * scientific prediction; do not use it to size evacuation zones without a
 * qualified fire behavior analyst reviewing it.
 */

const SPOTTING_CALIBRATION_CONSTANT = 0.0035; // arbitrary, tuned only for plausible magnitude

/**
 * @param {object} params
 * @param {number} params.flameLengthFt
 * @param {number} params.windSpeedMph  Open (20-ft) wind speed
 * @returns {{ maxSpotDistanceMi: number, isHeuristic: true }}
 */
export function estimateMaxSpotDistance({ flameLengthFt, windSpeedMph }) {
  const flame = Math.max(flameLengthFt, 0);
  const wind = Math.max(windSpeedMph, 0);
  const maxSpotDistanceMi = SPOTTING_CALIBRATION_CONSTANT * Math.sqrt(flame) * wind ** 1.5;
  return { maxSpotDistanceMi, isHeuristic: true };
}
