/**
 * rothermel.js
 * Rothermel (1972) surface fire spread model — "A Mathematical Model for
 * Predicting Fire Spread in Wildland Fuels" (USDA Forest Service Research
 * Paper INT-115) — with the multi-size-class surface-area weighting scheme
 * from Albini (1976, PSW BEHAVE documentation), following the consolidated
 * equation-by-equation walkthrough in Andrews (2018, RMRS-GTR-371) "The
 * Rothermel Surface Fire Spread Model and Associated Developments: A
 * Comprehensive Explanation."
 *
 * This is the ESTABLISHED PHYSICS layer of the fire engine (see
 * docs/fire-engine/ARCHITECTURE.md §1). It has not been numerically
 * cross-checked against a certified BehavePlus run in this environment —
 * the equations are the published ones, but treat outputs as unverified
 * until backtested (Phase 4).
 *
 * Units follow Rothermel's original imperial convention throughout:
 * loads in lb/ft^2, SAV in ft^-1, wind in ft/min internally (mph at the
 * public API boundary), rate of spread in ft/min, intensity in BTU/ft^2/min
 * (reaction) and BTU/ft/s (fireline/Byram), flame length in ft.
 */

import {
  PARTICLE_DENSITY_LB_FT3,
  TOTAL_MINERAL_CONTENT,
  EFFECTIVE_MINERAL_CONTENT,
} from './fuelModels';

const MPH_TO_FT_MIN = 88;
const MINERAL_DAMPING = 0.174 * EFFECTIVE_MINERAL_CONTENT ** -0.19; // constant, ~0.4175

function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

/**
 * Moisture damping coefficient, Rothermel (1972) eq. 29 (polynomial fit).
 * @param {number} moistureRatio  M_f / M_x, dimensionless
 */
function moistureDampingCoefficient(moistureRatio) {
  const r = clamp(moistureRatio, 0, 10);
  if (r >= 1) return 0;
  return clamp(1 - 2.59 * r + 5.11 * r ** 2 - 3.52 * r ** 3, 0, 1);
}

/**
 * @typedef {object} MoistureProfile Fractions (0.08 = 8%), not percent.
 * @property {number} oneHr
 * @property {number} tenHr
 * @property {number} hundredHr
 * @property {number} liveHerb
 * @property {number} liveWoody
 */

/**
 * Bridges a single observed dead-fuel-moisture reading (the only signal the
 * app's existing RAWS integration provides today) into a full multi-class
 * moisture profile. The 10-hr/100-hr offsets and live-fuel defaults are
 * rough NFDRS-informed placeholders, NOT measured values — replace with real
 * per-class moisture (NFDRS fuel moisture model output) in Phase 2.
 * @param {number} deadFuelMoisturePct
 * @param {object} [live]
 * @param {number} [live.liveHerbPct]
 * @param {number} [live.liveWoodyPct]
 * @returns {MoistureProfile}
 */
export function estimateMoistureProfile(deadFuelMoisturePct, live = {}) {
  const oneHrPct = Math.max(deadFuelMoisturePct, 1);
  return {
    oneHr: oneHrPct / 100,
    tenHr: (oneHrPct + 2) / 100,
    hundredHr: (oneHrPct + 4) / 100,
    liveHerb: (live.liveHerbPct ?? 90) / 100,
    liveWoody: (live.liveWoodyPct ?? 110) / 100,
  };
}

const DEAD_CLASSES = ['oneHr', 'tenHr', 'hundredHr'];
const LIVE_CLASSES = ['liveHerb', 'liveWoody'];

function buildParticleClasses(fuelModel) {
  const classes = [];
  for (const key of DEAD_CLASSES) {
    const load = fuelModel.loadLbFt2[key];
    if (load > 0) classes.push({ key, category: 'dead', load, sav: fuelModel.savFt1[key] });
  }
  for (const key of LIVE_CLASSES) {
    const load = fuelModel.loadLbFt2[key];
    if (load > 0) classes.push({ key, category: 'live', load, sav: fuelModel.savFt1[key] });
  }
  return classes;
}

/**
 * @typedef {object} SurfaceFireBehavior
 * @property {number} rateOfSpreadFtMin
 * @property {number} rateOfSpreadChainsHr
 * @property {number} reactionIntensityBtuFt2Min
 * @property {number} firelineIntensityBtuFtS
 * @property {number} flameLengthFt
 * @property {number} residenceTimeMin
 * @property {number} characteristicSav
 * @property {number} packingRatio
 * @property {number} optimumPackingRatio
 * @property {number} windFactor
 * @property {number} slopeFactor
 * @property {number} noWindNoSlopeRateOfSpreadFtMin
 */

/**
 * Compute Rothermel surface fire spread rate and derived Byram intensity /
 * flame length for a single homogeneous fuel cell.
 * @param {object} params
 * @param {import('./fuelModels').FuelModel} params.fuelModel
 * @param {MoistureProfile} params.moisture
 * @param {number} params.midflameWindMph
 * @param {number} params.slopeSteepness  Rise/run, e.g. 0.3 for a 30% slope (not degrees)
 * @returns {SurfaceFireBehavior}
 */
export function computeSurfaceFireBehavior({ fuelModel, moisture, midflameWindMph, slopeSteepness }) {
  const classes = buildParticleClasses(fuelModel);
  const totalLoad = classes.reduce((sum, c) => sum + c.load, 0);
  if (totalLoad <= 0 || classes.length === 0) {
    return zeroSpreadResult();
  }

  const surfaceArea = classes.map((c) => ({ ...c, area: (c.load * c.sav) / PARTICLE_DENSITY_LB_FT3 }));
  const areaDead = sumWhere(surfaceArea, 'dead');
  const areaLive = sumWhere(surfaceArea, 'live');
  const areaTotal = areaDead + areaLive;

  const sigmaDead = weightedSav(surfaceArea, 'dead', areaDead);
  const sigmaLive = weightedSav(surfaceArea, 'live', areaLive);
  const fDead = areaTotal > 0 ? areaDead / areaTotal : 0;
  const fLive = areaTotal > 0 ? areaLive / areaTotal : 0;
  const sigma = fDead * sigmaDead + fLive * sigmaLive;

  const netLoadDead = sumNetLoad(classes, 'dead');
  const netLoadLive = sumNetLoad(classes, 'live');

  const mfDead = weightedMoisture(surfaceArea, moisture, 'dead', areaDead);
  const mfLive = weightedMoisture(surfaceArea, moisture, 'live', areaLive);

  const mxDead = fuelModel.moistureOfExtinctionDead;
  const mxLive = liveMoistureOfExtinction({ netLoadDead, netLoadLive, mfDead, mxDead });

  const etaMDead = moistureDampingCoefficient(mfDead / mxDead);
  const etaMLive = netLoadLive > 0 ? moistureDampingCoefficient(mfLive / mxLive) : 0;

  const rhoB = totalLoad / fuelModel.depthFt;
  const beta = rhoB / PARTICLE_DENSITY_LB_FT3;
  const betaOp = 3.348 * sigma ** -0.8189;

  const gammaMaxPrime = sigma ** 1.5 / (495 + 0.0594 * sigma ** 1.5);
  const aConst = 133 * sigma ** -0.7913;
  const betaRatio = beta / betaOp;
  const gammaPrime = gammaMaxPrime * betaRatio ** aConst * Math.exp(aConst * (1 - betaRatio));

  const heatDead = fuelModel.heatContentBtuLb;
  const heatLive = fuelModel.heatContentBtuLb;
  const reactionIntensity =
    gammaPrime * (netLoadDead * heatDead * etaMDead + netLoadLive * heatLive * etaMLive) * MINERAL_DAMPING;

  const propagatingFlux = Math.exp((0.792 + 0.681 * Math.sqrt(sigma)) * (beta + 0.1)) / (192 + 0.2595 * sigma);

  let heatSink = 0;
  for (const c of surfaceArea) {
    if (areaTotal <= 0) continue;
    const weight = c.area / areaTotal;
    const epsilon = Math.exp(-138 / c.sav);
    const qig = 250 + 1116 * moisture[c.key];
    heatSink += weight * epsilon * qig;
  }
  heatSink *= rhoB;

  const windFtMin = Math.max(midflameWindMph, 0) * MPH_TO_FT_MIN;
  const C = 7.47 * Math.exp(-0.133 * sigma ** 0.55);
  const B = 0.02526 * sigma ** 0.54;
  const E = 0.715 * Math.exp(-0.000359 * sigma);
  const windFactor = windFtMin > 0 ? C * windFtMin ** B * betaRatio ** -E : 0;

  const slope = Math.max(slopeSteepness, 0);
  const slopeFactor = slope > 0 ? 5.275 * beta ** -0.3 * slope ** 2 : 0;

  const noWindNoSlopeRos = heatSink > 0 ? (reactionIntensity * propagatingFlux) / heatSink : 0;
  const rateOfSpreadFtMin = heatSink > 0
    ? (reactionIntensity * propagatingFlux * (1 + windFactor + slopeFactor)) / heatSink
    : 0;

  const residenceTimeMin = 384 / sigma;
  const firelineIntensityBtuFtS = reactionIntensity * residenceTimeMin * (rateOfSpreadFtMin / 60);
  const flameLengthFt = 0.45 * firelineIntensityBtuFtS ** 0.46;

  return {
    rateOfSpreadFtMin,
    rateOfSpreadChainsHr: rateOfSpreadFtMin * (60 / 66),
    reactionIntensityBtuFt2Min: reactionIntensity,
    firelineIntensityBtuFtS,
    flameLengthFt,
    residenceTimeMin,
    characteristicSav: sigma,
    packingRatio: beta,
    optimumPackingRatio: betaOp,
    windFactor,
    slopeFactor,
    noWindNoSlopeRateOfSpreadFtMin: noWindNoSlopeRos,
  };
}

function zeroSpreadResult() {
  return {
    rateOfSpreadFtMin: 0,
    rateOfSpreadChainsHr: 0,
    reactionIntensityBtuFt2Min: 0,
    firelineIntensityBtuFtS: 0,
    flameLengthFt: 0,
    residenceTimeMin: 0,
    characteristicSav: 0,
    packingRatio: 0,
    optimumPackingRatio: 0,
    windFactor: 0,
    slopeFactor: 0,
    noWindNoSlopeRateOfSpreadFtMin: 0,
  };
}

function sumWhere(surfaceArea, category) {
  return surfaceArea.filter((c) => c.category === category).reduce((s, c) => s + c.area, 0);
}

function weightedSav(surfaceArea, category, categoryArea) {
  if (categoryArea <= 0) return 0;
  return surfaceArea
    .filter((c) => c.category === category)
    .reduce((s, c) => s + (c.area / categoryArea) * c.sav, 0);
}

function weightedMoisture(surfaceArea, moisture, category, categoryArea) {
  if (categoryArea <= 0) return 0;
  return surfaceArea
    .filter((c) => c.category === category)
    .reduce((s, c) => s + (c.area / categoryArea) * moisture[c.key], 0);
}

function sumNetLoad(classes, category) {
  return classes
    .filter((c) => c.category === category)
    .reduce((s, c) => s + c.load * (1 - TOTAL_MINERAL_CONTENT), 0);
}

/**
 * Live fuel moisture of extinction, Albini (1976) dynamic correction as
 * documented in Andrews (2018) eq. 88. Falls back to the fuel model's dead
 * extinction moisture when there's no live fuel load (the value is unused
 * in that case since netLoadLive gates its contribution to zero anyway).
 */
function liveMoistureOfExtinction({ netLoadDead, netLoadLive, mfDead, mxDead }) {
  if (netLoadLive <= 0) return mxDead;
  const loadRatio = netLoadDead / netLoadLive;
  const mxLive = 2.9 * loadRatio * (1 - mfDead / mxDead) - 0.226;
  return Math.max(mxLive, mxDead);
}
