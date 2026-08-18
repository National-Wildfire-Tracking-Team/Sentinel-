/**
 * crownFire.js
 * Crown fire initiation — Van Wagner (1977), "Conditions for the Start and
 * Spread of Crown Fire" (Canadian Journal of Forest Research). Established
 * physics: compares surface fireline intensity against a critical intensity
 * derived from canopy base height and foliar moisture content.
 *
 * Crown fire spread rate uses Rothermel (1991, GTR-INT-438) "Predicting
 * Behavior and Size of Crown Fires in the Northern Rocky Mountains" — an
 * EMPIRICAL CORRELATION (R_active ≈ 3.34 × R_10), not a first-principles
 * crown-fuel spread calculation. Crown fire *type* (passive vs. active) is
 * NOT classified here — that needs Cruz et al.'s critical crown spread rate
 * criterion, not yet implemented (see docs/fire-engine/ARCHITECTURE.md §1.1).
 */

const BTU_FT_S_TO_KW_M = 3.4613;
const CROWN_SPREAD_MULTIPLIER = 3.34;

/**
 * Van Wagner (1977) critical surface fireline intensity for crown fire
 * initiation.
 * @param {number} canopyBaseHeightM
 * @param {number} foliarMoistureContentPct e.g. 100 for 100%
 * @returns {number} Critical intensity, kW/m
 */
export function criticalIntensityForCrowning(canopyBaseHeightM, foliarMoistureContentPct) {
  const cbh = Math.max(canopyBaseHeightM, 0);
  return (0.01 * cbh * (460 + 25.9 * foliarMoistureContentPct)) ** 1.5;
}

/**
 * @param {object} params
 * @param {number} params.surfaceFirelineIntensityBtuFtS
 * @param {number} params.canopyBaseHeightM
 * @param {number} params.foliarMoistureContentPct
 * @param {number} params.rateOfSpreadFuelModel10FtMin  Surface ROS under the
 *   same wind/slope/moisture conditions but with Anderson fuel model 10
 *   (timber litter/understory) — the reference fuel Rothermel (1991) used.
 * @returns {{
 *   crowningInitiates: boolean,
 *   criticalIntensityKwM: number,
 *   surfaceIntensityKwM: number,
 *   crownRateOfSpreadFtMin: number|null
 * }}
 */
export function assessCrownFire({
  surfaceFirelineIntensityBtuFtS,
  canopyBaseHeightM,
  foliarMoistureContentPct,
  rateOfSpreadFuelModel10FtMin,
}) {
  const surfaceIntensityKwM = surfaceFirelineIntensityBtuFtS * BTU_FT_S_TO_KW_M;
  const criticalIntensityKwM = criticalIntensityForCrowning(canopyBaseHeightM, foliarMoistureContentPct);
  const crowningInitiates = surfaceIntensityKwM >= criticalIntensityKwM && canopyBaseHeightM > 0;

  return {
    crowningInitiates,
    criticalIntensityKwM,
    surfaceIntensityKwM,
    crownRateOfSpreadFtMin: crowningInitiates
      ? CROWN_SPREAD_MULTIPLIER * rateOfSpreadFuelModel10FtMin
      : null,
  };
}
