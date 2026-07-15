/**
 * fireBehaviorModel.js
 * Simplified fire spread projection for situational-awareness visualization.
 *
 * This is NOT a certified fire behavior model — there is no fuel-model,
 * terrain/slope, or gridded wind forecast input. It estimates a rough,
 * directional "where might this fire be in N hours" shape using a
 * double-ellipse growth model (Anderson, 1983) driven by the nearest RAWS
 * station's observed wind and fuel moisture, assuming a moderate/uniform
 * fuel bed. Always defer to official incident management sources
 * (InciWeb, NIFC, local fire authorities) for operational decisions.
 */

const CHAIN_TO_FT = 66;
const MI_PER_DEG_LAT = 69.0;
const EARTH_RADIUS_MI = 3958.8;

const MAX_STATION_DISTANCE_MI = 75;
const DEFAULT_WIND_MPH = 6;
const DEFAULT_FUEL_MOISTURE_PCT = 12;

function milesBetween([lng1, lat1], [lng2, lat2]) {
  const latRad = (lat1 * Math.PI) / 180;
  const dLat = (lat2 - lat1) * MI_PER_DEG_LAT;
  const dLng = (lng2 - lng1) * MI_PER_DEG_LAT * Math.cos(latRad);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Find the nearest RAWS station (within MAX_STATION_DISTANCE_MI) reporting wind or fuel moisture. */
export function findNearestStation(point, rawsFeatures) {
  if (!point || !Array.isArray(rawsFeatures) || rawsFeatures.length === 0) return null;

  let best = null;
  let bestDistanceMi = Infinity;
  for (const f of rawsFeatures) {
    const coords = f?.geometry?.coordinates;
    const p = f?.properties;
    if (!coords || !p) continue;
    if (p.windSpeed == null && p.fuelMoisture == null) continue;
    const distanceMi = milesBetween(point, coords);
    if (distanceMi < bestDistanceMi) {
      bestDistanceMi = distanceMi;
      best = f;
    }
  }
  if (!best || bestDistanceMi > MAX_STATION_DISTANCE_MI) return null;
  return { station: best, distanceMi: bestDistanceMi };
}

/**
 * Rate-of-spread + fire-shape estimate, given local wind speed and fuel moisture.
 * Falls back to conservative defaults when no nearby station data is available.
 */
export function estimateFireBehavior({ windSpeedMph, fuelMoisturePct }) {
  const windMph = Number.isFinite(windSpeedMph) ? Math.max(windSpeedMph, 0) : DEFAULT_WIND_MPH;
  const fuelMoistureUsed = Number.isFinite(fuelMoisturePct)
    ? Math.max(fuelMoisturePct, 1)
    : DEFAULT_FUEL_MOISTURE_PCT;

  // Base (no-wind) spread rate falls off as fuel moisture rises; fuels above
  // ~30% moisture are treated as essentially non-spreading.
  const moistureDamping = Math.max(0, 1 - fuelMoistureUsed / 30);
  const baseRosChPerHr = 1.2 + 5 * moistureDamping ** 1.5;

  // Empirical wind multiplier — wind dominates spread rate, as in real fire behavior.
  const windFactor = 1 + 0.9 * windMph ** 0.85;
  const rosHeadChPerHr = Math.min(baseRosChPerHr * windFactor, 120);

  // Length-to-width ratio grows with wind speed (Anderson 1983 approximation), capped at 8:1.
  const lengthWidthRatio = Math.min(1 + 0.125 * windMph, 8);
  const eccentricity = Math.sqrt(Math.max(0, 1 - 1 / lengthWidthRatio ** 2));
  const rosBackChPerHr = (rosHeadChPerHr * (1 - eccentricity)) / (1 + eccentricity);

  // Byram (1959) fireline intensity → flame length, assuming a moderate fuel load.
  const FUEL_LOAD_LB_FT2 = 0.6;
  const HEAT_CONTENT_BTU_LB = 8000;
  const rosFtPerS = (rosHeadChPerHr * CHAIN_TO_FT) / 3600;
  const intensityBtuFtS = HEAT_CONTENT_BTU_LB * FUEL_LOAD_LB_FT2 * rosFtPerS;
  const flameLengthFt = 0.45 * intensityBtuFtS ** 0.46;

  return {
    windSpeedMph: windMph,
    fuelMoisturePct: fuelMoistureUsed,
    rosHeadChPerHr,
    rosBackChPerHr,
    lengthWidthRatio,
    intensityBtuFtS,
    flameLengthFt,
  };
}

/** Offset a [lng,lat] point by a compass bearing (deg, 0=N clockwise) and distance (miles). */
function destinationPoint([lng, lat], bearingDeg, distanceMi) {
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angularDist = distanceMi / EARTH_RADIUS_MI;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDist) +
    Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearing)
  );
  const newLngRad = lngRad + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDist) * Math.cos(latRad),
    Math.cos(angularDist) - Math.sin(latRad) * Math.sin(newLatRad)
  );

  return [((newLngRad * 180) / Math.PI + 540) % 360 - 180, (newLatRad * 180) / Math.PI];
}

const ELLIPSE_SEGMENTS = 48;

/**
 * Build a double-ellipse spread-projection polygon centered on the ignition
 * point, elongated downwind, for a given time horizon.
 * @param {[number, number]} ignition [lng, lat]
 * @param {number|null} windDirDeg Compass direction the wind blows FROM.
 * @param {object} behavior Output of estimateFireBehavior()
 * @param {number} hours Projection horizon in hours
 */
export function buildSpreadPolygon({ ignition, windDirDeg, behavior, hours }) {
  const { rosHeadChPerHr, rosBackChPerHr, lengthWidthRatio } = behavior;
  const headDistMi = (rosHeadChPerHr * CHAIN_TO_FT * hours) / 5280;
  const backDistMi = (rosBackChPerHr * CHAIN_TO_FT * hours) / 5280;
  const semiMajorMi = (headDistMi + backDistMi) / 2;
  const semiMinorMi = semiMajorMi / lengthWidthRatio;
  const centerOffsetMi = (headDistMi - backDistMi) / 2;

  // Wind direction is FROM; fire spreads TOWARD the downwind bearing.
  const spreadBearing = Number.isFinite(windDirDeg) ? (windDirDeg + 180) % 360 : 90;

  // The ignition point is the rear focus of the ellipse; its center sits
  // `centerOffsetMi` downwind.
  const center = destinationPoint(ignition, spreadBearing, centerOffsetMi);

  const ring = [];
  for (let i = 0; i <= ELLIPSE_SEGMENTS; i++) {
    const t = (i / ELLIPSE_SEGMENTS) * 2 * Math.PI;
    const x = semiMajorMi * Math.cos(t); // + = downwind
    const y = semiMinorMi * Math.sin(t); // flank offset
    const distMi = Math.sqrt(x * x + y * y);
    const localBearing = (Math.atan2(y, x) * 180) / Math.PI;
    const worldBearing = (spreadBearing + localBearing + 360) % 360;
    ring.push(destinationPoint(center, worldBearing, distMi));
  }
  ring.push(ring[0]);

  return { type: 'Polygon', coordinates: [ring] };
}
