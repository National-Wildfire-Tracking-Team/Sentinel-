/**
 * fireEngineDemo.mjs
 * Standalone demonstration of the Phase 1 fire behavior modeling engine
 * (src/fireEngine/). Run with:
 *
 *   node scripts/fireEngineDemo.mjs
 *
 * Uses synthetic inputs styled after a Santa Ana wind-driven chaparral fire
 * in the Santa Monica Mountains (Southern California) — a scenario chosen
 * because it's the kind of extreme-wind, dry-fuel event where fire behavior
 * modeling is most operationally relevant. Not a real fire; ignition point
 * and conditions are illustrative only.
 *
 * Phase 2 would replace the synthetic `grid` built below with one backed by
 * real LANDFIRE fuel/canopy rasters, USGS 3DEP slope/aspect, and HRRR wind —
 * see docs/fire-engine/ARCHITECTURE.md §3.
 *
 * Loaded via Vite's SSR module loader (not a plain `import`) because the
 * fire engine's source uses this codebase's standard extensionless import
 * style (`from '../utils/geoUtils'`), which Vite resolves but plain Node's
 * ESM loader does not.
 */

import { createServer } from 'vite';

const viteServer = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true } });
const {
  simulateFireGrowth,
  createFireGrid,
  getFuelModel,
  computeSurfaceFireBehavior,
  estimateMoistureProfile,
  assessCrownFire,
} = await viteServer.ssrLoadModule('/src/fireEngine/index.js');

const IGNITION_POINT = [-118.686, 34.088]; // Santa Monica Mountains, CA (illustrative)

// Spatially-varying conditions: a Santa-Ana-driven scenario where wind and
// fuel moisture worsen toward the northeast (the direction the offshore wind
// is racing downslope from), demonstrating the "not one wind speed for the
// whole fire" requirement.
function buildScenarioGrid({ baseWindMph, windDirectionDegFrom, deadFuelMoisturePct }) {
  return createFireGrid([
    {
      center: [IGNITION_POINT[0], IGNITION_POINT[1]],
      conditions: {
        fuelModelId: 4, // chaparral
        deadFuelMoisturePct,
        windSpeed20ftMph: baseWindMph,
        windDirectionDegFrom,
        slopePercent: 25,
      },
    },
    {
      center: [IGNITION_POINT[0] + 0.03, IGNITION_POINT[1] + 0.02],
      conditions: {
        fuelModelId: 4,
        deadFuelMoisturePct: deadFuelMoisturePct - 1,
        windSpeed20ftMph: baseWindMph + 8,
        windDirectionDegFrom,
        slopePercent: 40, // steeper canyon terrain downwind
      },
    },
    {
      center: [IGNITION_POINT[0] - 0.03, IGNITION_POINT[1] - 0.02],
      conditions: {
        fuelModelId: 2, // grass/timber understory, sparser fuel upwind
        deadFuelMoisturePct: deadFuelMoisturePct + 3,
        windSpeed20ftMph: baseWindMph - 5,
        windDirectionDegFrom,
        slopePercent: 10,
      },
    },
  ]);
}

function printFeature(feature) {
  const p = feature.properties;
  console.log(
    `  +${String(p.horizonHours).padStart(2)}h  ROS(max) ${String(p.maxRateOfSpreadChainsHr).padStart(6)} ch/hr` +
    `  flame ${String(p.maxFlameLengthFt).padStart(5)} ft` +
    `  intensity ${String(p.maxFirelineIntensityBtuFtS).padStart(7)} BTU/ft/s` +
    `  spot(heuristic) ~${p.maxSpotDistanceMi} mi` +
    `  confidence ${p.confidence} (${p.confidenceLabel})`
  );
}

function runScenario(name, grid) {
  console.log(`\n=== Scenario: ${name} ===`);
  const result = simulateFireGrowth({
    ignitionPoint: IGNITION_POINT,
    grid,
    horizonsHours: [1, 3, 6, 12, 24],
    timeStepHours: 0.5,
    dataQuality: {
      fuelModelIsReal: true,
      windObservationAgeMin: 15,
      windStationDistanceMi: 4,
      moistureIsMeasured: true,
      terrainIsReal: true,
    },
  });
  result.features.forEach(printFeature);
  return result;
}

console.log('Fire Behavior Modeling Engine — Phase 1 demonstration');
console.log('Ignition point:', IGNITION_POINT, '(Santa Monica Mountains, CA — illustrative)');
console.log('Fuel: Anderson FM4 (chaparral) near ignition, FM2 upwind. Slope 10-40%.');

const currentConditions = runScenario(
  'Current conditions (Santa Ana onset, 20 mph from NE, 8% dead fuel moisture)',
  buildScenarioGrid({ baseWindMph: 20, windDirectionDegFrom: 45, deadFuelMoisturePct: 8 })
);

runScenario(
  'Extreme wind event (spec §11: "35 mph winds")',
  buildScenarioGrid({ baseWindMph: 35, windDirectionDegFrom: 45, deadFuelMoisturePct: 8 })
);

runScenario(
  'Drier conditions (spec §11: "RH drops, 4% dead fuel moisture")',
  buildScenarioGrid({ baseWindMph: 20, windDirectionDegFrom: 45, deadFuelMoisturePct: 4 })
);

runScenario(
  'Wind shift to due-west offshore flow',
  buildScenarioGrid({ baseWindMph: 20, windDirectionDegFrom: 270, deadFuelMoisturePct: 8 })
);

// --- Crown fire check, standalone (not yet wired into simulateFireGrowth output) ---
console.log('\n=== Crown fire initiation check (Van Wagner 1977) ===');
const fuelModel4 = getFuelModel(4);
const surfaceBehavior = computeSurfaceFireBehavior({
  fuelModel: fuelModel4,
  moisture: estimateMoistureProfile(6),
  midflameWindMph: 12, // already-adjusted midflame estimate for this illustration
  slopeSteepness: 0.25,
});
const crownCheck = assessCrownFire({
  surfaceFirelineIntensityBtuFtS: surfaceBehavior.firelineIntensityBtuFtS,
  canopyBaseHeightM: 2,
  foliarMoistureContentPct: 100,
  rateOfSpreadFuelModel10FtMin: surfaceBehavior.rateOfSpreadFtMin, // stand-in; use real FM10 run in production
});
console.log(`  Surface intensity: ${surfaceBehavior.firelineIntensityBtuFtS.toFixed(0)} BTU/ft/s`);
console.log(`  Critical intensity for crowning: ${crownCheck.criticalIntensityKwM.toFixed(0)} kW/m`);
console.log(`  Surface intensity (kW/m): ${crownCheck.surfaceIntensityKwM.toFixed(0)} kW/m`);
console.log(`  Crowning initiates: ${crownCheck.crowningInitiates}`);

console.log('\nFull GeoJSON FeatureCollection for "Current conditions" scenario:');
console.log(JSON.stringify(currentConditions, null, 2));

await viteServer.close();
