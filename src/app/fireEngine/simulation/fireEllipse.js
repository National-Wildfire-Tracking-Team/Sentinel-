/**
 * fireEllipse.js
 * Elliptical fire growth shape: converts a head rate of spread into a
 * direction-dependent (radial) rate of spread using the standard
 * focus-based ellipse formula also used in src/utils/fireBehaviorModel.js:
 *
 *   R(theta) = R_head * (1 - e) / (1 - e * cos(theta))
 *
 * where theta is measured from the downwind (head) bearing and e is the
 * eccentricity implied by the fire's length-to-breadth (LB) ratio. This
 * reduces to R_head at theta=0 and R_back at theta=180.
 *
 * CAVEAT (see docs/fire-engine/ARCHITECTURE.md §1.1): deriveLengthToBreadthRatio
 * intentionally reuses the same simple linear approximation already shipping
 * in fireBehaviorModel.js rather than the exponential Anderson(1983)/
 * Alexander(1985) curve sometimes cited in the literature, because this
 * author could not confidently reconstruct that curve's exact published
 * coefficients from memory. Replace with primary-source coefficients before
 * treating the LB ratio itself as scientifically validated.
 */

const MAX_LENGTH_TO_BREADTH_RATIO = 8;

/**
 * @param {number} windSpeedMph  Midflame or open wind speed
 * @returns {number} Length-to-breadth ratio, >= 1
 */
export function deriveLengthToBreadthRatio(windSpeedMph) {
  return Math.min(1 + 0.125 * Math.max(windSpeedMph, 0), MAX_LENGTH_TO_BREADTH_RATIO);
}

/** @param {number} lengthToBreadthRatio >= 1 */
export function eccentricityFromLB(lengthToBreadthRatio) {
  const lb = Math.max(lengthToBreadthRatio, 1);
  return Math.sqrt(Math.max(0, 1 - 1 / lb ** 2));
}

/** Backing (upwind) rate of spread implied by the head rate and eccentricity. */
export function backingRateOfSpread(headRateOfSpread, eccentricity) {
  return (headRateOfSpread * (1 - eccentricity)) / (1 + eccentricity);
}

/**
 * Radial rate of spread at a given compass bearing.
 * @param {object} params
 * @param {number} params.headRateOfSpread    Any consistent unit (ft/min, chains/hr, ...)
 * @param {number} params.eccentricity
 * @param {number} params.bearingDeg          Compass bearing from the fire's centroid/focus
 * @param {number} params.spreadBearingDeg    Downwind (head-fire) compass bearing
 * @returns {number}
 */
export function radialRateOfSpread({ headRateOfSpread, eccentricity, bearingDeg, spreadBearingDeg }) {
  const thetaDeg = ((bearingDeg - spreadBearingDeg + 540) % 360) - 180;
  const thetaRad = (thetaDeg * Math.PI) / 180;
  return (headRateOfSpread * (1 - eccentricity)) / (1 - eccentricity * Math.cos(thetaRad));
}
