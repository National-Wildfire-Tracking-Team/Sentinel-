/**
 * grid.js
 * Spatially-varying environmental conditions for the fire engine (spec
 * requirement: "Do NOT assume the entire fire has one wind speed, one fuel
 * model, or one slope"). Phase 1 uses nearest-neighbor lookup over
 * caller-supplied cells rather than a true raster — see
 * docs/fire-engine/ARCHITECTURE.md §4 for the resolution/rasterization
 * roadmap once LANDFIRE/DEM/HRRR ingestion exists.
 */

import { distanceMiles } from '../geo';

/**
 * @typedef {object} CellConditions
 * @property {number} fuelModelId              Anderson fuel model id (1-13)
 * @property {number} deadFuelMoisturePct       Single dead-fuel-moisture reading (%)
 * @property {number} [liveHerbMoisturePct]
 * @property {number} [liveWoodyMoisturePct]
 * @property {number} windSpeed20ftMph
 * @property {number} windDirectionDegFrom      Compass direction the wind blows FROM
 * @property {number} [slopePercent]            Rise/run * 100, default 0 (flat)
 * @property {number} [aspectDeg]               Downslope direction, unused in Phase 1 (slope factor is direction-agnostic magnitude only)
 * @property {number} [canopyHeightFt]
 * @property {number} [canopyCoverFraction]     0-1
 * @property {number} [canopyBaseHeightM]
 * @property {number} [foliarMoistureContentPct]
 */

/** A grid where every location shares the same conditions — the trivial case, for bridging single-station data (today's RAWS integration) into the engine. */
export function createUniformGrid(conditions) {
  return {
    sampleAt: () => conditions,
    isUniform: true,
  };
}

/**
 * A grid backed by discrete sample points (e.g. per-RAWS-station, per-DEM-cell
 * centroid), resolved by nearest-neighbor. Not a true raster — fine for a
 * handful to a few hundred cells; revisit for large gridded rasters (Phase 2).
 * @param {Array<{ center: [number, number], conditions: CellConditions }>} cells
 */
export function createFireGrid(cells) {
  if (!Array.isArray(cells) || cells.length === 0) {
    throw new Error('createFireGrid requires at least one cell');
  }
  return {
    sampleAt(point) {
      let best = cells[0];
      let bestDist = distanceMiles(point, cells[0].center);
      for (let i = 1; i < cells.length; i++) {
        const d = distanceMiles(point, cells[i].center);
        if (d < bestDist) {
          bestDist = d;
          best = cells[i];
        }
      }
      return best.conditions;
    },
    isUniform: false,
    cells,
  };
}
