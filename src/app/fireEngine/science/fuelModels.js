/**
 * fuelModels.js
 * Anderson (1982) 13 standard fire behavior fuel models — "Aids to Determining
 * Fuel Models for Estimating Fire Behavior" (USDA Forest Service GTR-INT-122).
 * This is the classic NFFL-13 set used throughout BEHAVE/BehavePlus/FARSITE.
 *
 * Values below are transcribed from memory of the widely-republished standard
 * table (loads in tons/acre, depth in ft, moisture of extinction in %, SAV in
 * ft^-1). They have NOT been cross-checked against BehavePlus's own
 * fuel_models data file in this environment — before using these for anything
 * beyond development/testing, diff them against a primary source (BehavePlus
 * or the original GTR-INT-122 tables).
 *
 * Scott & Burgan (2005) 40 fuel models (used with LANDFIRE data) are NOT
 * included yet — see docs/fire-engine/ARCHITECTURE.md Phase 2. The shape of
 * this module (a plain lookup of FuelModel records) is designed so SB40 can
 * be added as a second table without changing any consumer.
 */

const TONS_PER_ACRE_TO_LB_PER_FT2 = 2000 / 43560;

/** Fixed geometric SAV constants for 10-hr and 100-hr dead fuel, ft^-1. Not fuel-model-specific. */
export const SAV_10HR = 109;
export const SAV_100HR = 30;

/** Oven-dry particle density, lb/ft^3 — Rothermel's standard default for all wildland fuels. */
export const PARTICLE_DENSITY_LB_FT3 = 32;

/** Total mineral content fraction (S_T) — standard default. */
export const TOTAL_MINERAL_CONTENT = 0.0555;

/** Effective (silica-free) mineral content fraction (S_e) — standard default. */
export const EFFECTIVE_MINERAL_CONTENT = 0.01;

function tonsToLbFt2(tonsPerAcre) {
  return tonsPerAcre * TONS_PER_ACRE_TO_LB_PER_FT2;
}

/**
 * @typedef {object} FuelModel
 * @property {number} id            Anderson fuel model number (1-13)
 * @property {string} code
 * @property {string} name
 * @property {number} depthFt       Fuel bed depth
 * @property {number} moistureOfExtinctionDead  Fraction (e.g. 0.12 for 12%)
 * @property {number} heatContentBtuLb
 * @property {{oneHr:number, tenHr:number, hundredHr:number, liveHerb:number, liveWoody:number}} loadLbFt2
 * @property {{oneHr:number, tenHr:number, hundredHr:number, liveHerb:number, liveWoody:number}} savFt1
 */

/** @type {Record<number, FuelModel>} */
export const ANDERSON_FUEL_MODELS = {
  1: fm(1, 'FM1', 'Short grass (1 ft)', 1.0, 12, { oneHr: 0.74 }, { oneHr: 3500 }),
  2: fm(2, 'FM2', 'Timber grass and understory', 1.0, 15,
    { oneHr: 2.0, tenHr: 1.0, hundredHr: 0.5, liveHerb: 0.5 },
    { oneHr: 3000, liveHerb: 1500 }),
  3: fm(3, 'FM3', 'Tall grass (2.5 ft)', 2.5, 25, { oneHr: 3.01 }, { oneHr: 1500 }),
  4: fm(4, 'FM4', 'Chaparral (6 ft)', 6.0, 20,
    { oneHr: 5.01, tenHr: 4.01, hundredHr: 2.0, liveWoody: 5.01 },
    { oneHr: 2000, liveWoody: 1500 }),
  5: fm(5, 'FM5', 'Brush (2 ft)', 2.0, 20,
    { oneHr: 1.0, tenHr: 0.5, liveWoody: 2.0 },
    { oneHr: 2000, liveWoody: 1500 }),
  6: fm(6, 'FM6', 'Dormant brush, hardwood slash', 2.5, 25,
    { oneHr: 1.5, tenHr: 2.5, hundredHr: 2.0 },
    { oneHr: 1750 }),
  7: fm(7, 'FM7', 'Southern rough', 2.5, 40,
    { oneHr: 1.13, tenHr: 1.87, hundredHr: 1.5, liveWoody: 0.37 },
    { oneHr: 1750, liveWoody: 1550 }),
  8: fm(8, 'FM8', 'Closed timber litter', 0.2, 30,
    { oneHr: 1.5, tenHr: 1.0, hundredHr: 2.5 },
    { oneHr: 2000 }),
  9: fm(9, 'FM9', 'Hardwood litter', 0.2, 25,
    { oneHr: 2.92, tenHr: 0.41, hundredHr: 0.15 },
    { oneHr: 2500 }),
  10: fm(10, 'FM10', 'Timber litter and understory', 1.0, 25,
    { oneHr: 3.01, tenHr: 2.0, hundredHr: 5.01, liveWoody: 2.0 },
    { oneHr: 2000, liveWoody: 1500 }),
  11: fm(11, 'FM11', 'Light logging slash', 1.0, 15,
    { oneHr: 1.5, tenHr: 4.51, hundredHr: 5.51 },
    { oneHr: 1500 }),
  12: fm(12, 'FM12', 'Medium logging slash', 2.3, 20,
    { oneHr: 4.01, tenHr: 14.03, hundredHr: 16.53 },
    { oneHr: 1500 }),
  13: fm(13, 'FM13', 'Heavy logging slash', 3.0, 25,
    { oneHr: 7.01, tenHr: 23.04, hundredHr: 28.05 },
    { oneHr: 1500 }),
};

function fm(id, code, name, depthFt, moistureOfExtinctionPct, loadsTonsPerAcre, sav) {
  return {
    id,
    code,
    name,
    depthFt,
    moistureOfExtinctionDead: moistureOfExtinctionPct / 100,
    heatContentBtuLb: 8000,
    loadLbFt2: {
      oneHr: tonsToLbFt2(loadsTonsPerAcre.oneHr || 0),
      tenHr: tonsToLbFt2(loadsTonsPerAcre.tenHr || 0),
      hundredHr: tonsToLbFt2(loadsTonsPerAcre.hundredHr || 0),
      liveHerb: tonsToLbFt2(loadsTonsPerAcre.liveHerb || 0),
      liveWoody: tonsToLbFt2(loadsTonsPerAcre.liveWoody || 0),
    },
    savFt1: {
      oneHr: sav.oneHr,
      tenHr: SAV_10HR,
      hundredHr: SAV_100HR,
      liveHerb: sav.liveHerb || sav.liveWoody || 1500,
      liveWoody: sav.liveWoody || sav.liveHerb || 1500,
    },
  };
}

/**
 * Look up a fuel model by Anderson id, throwing on unknown ids so a typo'd
 * fuel model number fails loudly instead of silently defaulting.
 * @param {number} id
 * @returns {FuelModel}
 */
export function getFuelModel(id) {
  const model = ANDERSON_FUEL_MODELS[id];
  if (!model) {
    throw new Error(`Unknown Anderson fuel model id: ${id}. Valid ids are 1-13.`);
  }
  return model;
}

export function listFuelModels() {
  return Object.values(ANDERSON_FUEL_MODELS);
}
