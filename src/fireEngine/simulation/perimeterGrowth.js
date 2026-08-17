/**
 * perimeterGrowth.js
 * Simplified Huygens'-principle fire perimeter propagation: every perimeter
 * vertex is treated as the origin of its own elliptical spread wavelet
 * (Rothermel ROS + focus-based ellipse, per science/rothermel.js and
 * fireEllipse.js), driven by that vertex's local grid cell. Stepping in
 * fixed sub-hour increments (not one multi-hour jump) lets conditions differ
 * cell-to-cell AND change over the course of the simulation, per spec
 * requirements §5/§7.
 *
 * KNOWN LIMITATION (see docs/fire-engine/ARCHITECTURE.md §5): this does not
 * detect or resolve self-intersections. Real Huygens-principle
 * implementations (FARSITE) regularize the front when it wraps around a
 * barrier or folds back on itself; this Phase 1 version will produce
 * distorted geometry in those cases. Fine for unobstructed growth over
 * short-to-moderate horizons, which is the Phase 1 scope.
 */

import { bearingDegrees, destinationPoint, resampleRing, closeRing } from '../geo';
import { ringCentroid } from '../../utils/geoUtils';
import { deriveLengthToBreadthRatio, eccentricityFromLB, radialRateOfSpread } from './fireEllipse';
import { evaluateCellBehavior } from './evaluateCell';

const MAX_VERTICES = 96;
const FT_PER_MILE = 5280;

/**
 * Build a small circular ring around a point-source ignition so it can be
 * grown by the same growPerimeter() loop used for mapped perimeters —
 * replacing the old "two separate code paths" approach with one.
 * @param {[number, number]} point [lng, lat]
 * @param {number} [initialRadiusMi]
 * @param {number} [numPoints]
 */
export function createIgnitionRing(point, initialRadiusMi = 0.015, numPoints = 24) {
  const ring = [];
  for (let i = 0; i < numPoints; i++) {
    const bearing = (360 * i) / numPoints;
    ring.push(destinationPoint(point, bearing, initialRadiusMi));
  }
  return closeRing(ring);
}

/**
 * @param {object} params
 * @param {number[][]} params.ring          Closed exterior ring, [lng, lat] pairs
 * @param {import('./grid').FireGrid} params.grid
 * @param {number} params.hours             Total projection horizon
 * @param {number} [params.timeStepHours]   Sub-step size; smaller = smoother/more responsive to changing conditions, more compute
 * @returns {{
 *   polygon: { type: 'Polygon', coordinates: number[][][] },
 *   maxRateOfSpreadChainsHr: number,
 *   maxFlameLengthFt: number,
 *   maxFirelineIntensityBtuFtS: number,
 * }}
 */
export function growPerimeter({ ring, grid, hours, timeStepHours = 1 }) {
  if (!Array.isArray(ring) || ring.length < 3) {
    throw new Error('growPerimeter requires a ring with at least 3 points');
  }
  if (hours <= 0) {
    throw new Error('growPerimeter requires hours > 0');
  }

  let current = resampleRing(ring, MAX_VERTICES);
  // Work with an open ring internally; close only for the returned GeoJSON.
  if (current[0][0] === current[current.length - 1][0] && current[0][1] === current[current.length - 1][1]) {
    current = current.slice(0, -1);
  }

  const steps = Math.max(1, Math.round(hours / timeStepHours));
  const dtHours = hours / steps;

  let maxRosChainsHr = 0;
  let maxFlameLengthFt = 0;
  let maxFirelineIntensity = 0;

  for (let step = 0; step < steps; step++) {
    const centroid = ringCentroid(current);
    if (!centroid) break; // degenerate ring (collapsed to a line/point) — stop growing rather than throw

    current = current.map((vertex) => {
      const bearing = bearingDegrees(centroid, vertex);
      const conditions = grid.sampleAt(vertex);
      const behavior = evaluateCellBehavior(conditions);

      maxRosChainsHr = Math.max(maxRosChainsHr, behavior.rateOfSpreadChainsHr);
      maxFlameLengthFt = Math.max(maxFlameLengthFt, behavior.flameLengthFt);
      maxFirelineIntensity = Math.max(maxFirelineIntensity, behavior.firelineIntensityBtuFtS);

      const lb = deriveLengthToBreadthRatio(behavior.midflameWindMph);
      const eccentricity = eccentricityFromLB(lb);
      const spreadBearing = (behavior.windDirectionDegFrom + 180) % 360;
      const radialRos = radialRateOfSpread({
        headRateOfSpread: behavior.rateOfSpreadFtMin,
        eccentricity,
        bearingDeg: bearing,
        spreadBearingDeg: spreadBearing,
      });

      const distMi = (Math.max(radialRos, 0) * dtHours * 60) / FT_PER_MILE;
      return destinationPoint(vertex, bearing, distMi);
    });
  }

  return {
    polygon: { type: 'Polygon', coordinates: [closeRing(current)] },
    maxRateOfSpreadChainsHr: maxRosChainsHr,
    maxFlameLengthFt,
    maxFirelineIntensityBtuFtS: maxFirelineIntensity,
  };
}
