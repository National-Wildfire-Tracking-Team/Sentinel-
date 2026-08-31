/**
 * windAdjustment.js
 * Converts a 20-ft (or 10-m, see note) observed/forecast wind speed into the
 * midflame wind speed Rothermel's model actually needs, using the simplified
 * open/sheltered wind adjustment factor (WAF) formulas from Albini & Baughman
 * (1979), as summarized in Andrews (2012, RMRS-GTR-266) "Modeling Wind
 * Adjustment Factor and Midflame Wind Speed for Rothermel's Surface Fire
 * Spread Model."
 *
 * Simplification vs. GTR-266: that report's full method also accounts for
 * canopy crown ratio and a blended open/sheltered case for partial canopy.
 * Here we use a binary choice — unsheltered (no meaningful canopy) or
 * sheltered (canopy present) — which is adequate for the 13 Anderson fuel
 * models (only 8/9 assume closed timber) but will understate WAF variability
 * under partial canopy. Flagged for Phase 2 refinement.
 */

/**
 * @param {number} fuelBedDepthFt
 * @returns {number} Wind adjustment factor (0-1), unsheltered case (no canopy)
 */
export function unshelteredWAF(fuelBedDepthFt) {
  const h = Math.max(fuelBedDepthFt, 0.1);
  return 1.83 / Math.log((20 + 0.36 * h) / (0.13 * h));
}

/**
 * @param {number} canopyHeightFt
 * @param {number} canopyCoverFraction 0-1
 * @returns {number} Wind adjustment factor (0-1), sheltered case (under canopy)
 */
export function shelteredWAF(canopyHeightFt, canopyCoverFraction) {
  const h = Math.max(canopyHeightFt, 1);
  const f = Math.min(Math.max(canopyCoverFraction, 0.01), 1);
  return 0.555 / (Math.sqrt(f * h) * Math.log((20 + 0.36 * h) / (0.13 * h)));
}

/**
 * @param {object} params
 * @param {number} params.windSpeed20ftMph
 * @param {number} params.fuelBedDepthFt
 * @param {number} [params.canopyHeightFt]
 * @param {number} [params.canopyCoverFraction] 0-1
 * @returns {{ midflameWindMph: number, waf: number }}
 */
export function midflameWindSpeed({ windSpeed20ftMph, fuelBedDepthFt, canopyHeightFt, canopyCoverFraction }) {
  const hasCanopy = Number.isFinite(canopyHeightFt) && canopyHeightFt > fuelBedDepthFt && canopyCoverFraction > 0.05;
  const waf = hasCanopy
    ? shelteredWAF(canopyHeightFt, canopyCoverFraction)
    : unshelteredWAF(fuelBedDepthFt);
  const clampedWaf = Math.min(Math.max(waf, 0.05), 1);
  return { midflameWindMph: windSpeed20ftMph * clampedWaf, waf: clampedWaf };
}
