/**
 * frontSymbols.js
 * Builds the standardized surface-analysis "pip" symbols (semicircles for
 * warm fronts, triangles for cold fronts, both alternating for occluded/
 * stationary fronts) that sit on top of the WPC front lines.
 *
 * MapLibre can't rotate a repeating line-pattern to follow a curving line,
 * so the pips are generated as a separate point layer: walk each front's
 * LineString at a fixed geographic spacing, and at each sample emit a point
 * whose `bearing` property points the icon perpendicular to the line (base
 * flush against the line, symbol bulging to one side) via
 * `icon-rotation-alignment: 'map'`.
 */

const EARTH_RADIUS_KM = 6371;
const PIP_SPACING_KM = 120;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad) {
  return (rad * 180) / Math.PI;
}
function normalizeBearing(deg) {
  return ((deg % 360) + 360) % 360;
}

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function initialBearing([lng1, lat1], [lng2, lat2]) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

/** Sample a single line's coordinates at fixed arc-length intervals, returning {lngLat, bearing}. */
function sampleLine(coords, spacingKm) {
  if (!Array.isArray(coords) || coords.length < 2) return [];

  const segLengths = [];
  let totalKm = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const len = haversineKm(coords[i], coords[i + 1]);
    segLengths.push(len);
    totalKm += len;
  }
  if (totalKm < spacingKm * 0.5) return [];

  const samples = [];
  let target = spacingKm * 0.5;
  let cursorKm = 0;
  let segIdx = 0;

  while (target < totalKm && segIdx < segLengths.length) {
    const segLen = segLengths[segIdx];
    if (segLen <= 0 || cursorKm + segLen < target) {
      cursorKm += segLen;
      segIdx += 1;
      continue;
    }
    const [a, b] = [coords[segIdx], coords[segIdx + 1]];
    const t = (target - cursorKm) / segLen;
    const lngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    samples.push({ lngLat, bearing: initialBearing(a, b) });
    target += spacingKm;
  }
  return samples;
}

function lineStringsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

/** Split a line's coordinates into sub-lines at the given arc-length distances (km). */
function splitLineByDistances(coords, boundaries) {
  if (!boundaries.length) return [coords];

  const segments = [];
  let current = [coords[0]];
  let cursorKm = 0;
  let boundaryIdx = 0;

  for (let i = 0; i < coords.length - 1; i += 1) {
    const segStart = coords[i];
    const segEnd = coords[i + 1];
    const segLen = haversineKm(segStart, segEnd);
    const segStartKm = cursorKm;
    const segEndKm = cursorKm + segLen;

    while (
      boundaryIdx < boundaries.length &&
      boundaries[boundaryIdx] > segStartKm &&
      boundaries[boundaryIdx] < segEndKm &&
      segLen > 0
    ) {
      const t = (boundaries[boundaryIdx] - segStartKm) / segLen;
      const splitPoint = [
        segStart[0] + (segEnd[0] - segStart[0]) * t,
        segStart[1] + (segEnd[1] - segStart[1]) * t,
      ];
      current.push(splitPoint);
      segments.push(current);
      current = [splitPoint];
      boundaryIdx += 1;
    }
    current.push(segEnd);
    cursorKm = segEndKm;
  }
  segments.push(current);
  return segments;
}

// icon id -> which side of the line's local travel direction the pip bulges
// toward. Kept per-type below since stationary fronts flip sides per pip.
const RIGHT_SIDE = 90;
const LEFT_SIDE = -90;

/** Decide the icon + side for the nth pip along a front of the given type. */
function pipForIndex(frontType, idx) {
  switch (frontType) {
    case 'WARM':
      return { icon: 'sentinel-front-semicircle-red', side: RIGHT_SIDE };
    case 'COLD':
      return { icon: 'sentinel-front-triangle-blue', side: RIGHT_SIDE };
    case 'OCCLUDED':
      return idx % 2 === 0
        ? { icon: 'sentinel-front-semicircle-purple', side: RIGHT_SIDE }
        : { icon: 'sentinel-front-triangle-purple', side: RIGHT_SIDE };
    case 'STATIONARY':
      return idx % 2 === 0
        ? { icon: 'sentinel-front-semicircle-red', side: RIGHT_SIDE }
        : { icon: 'sentinel-front-triangle-blue', side: LEFT_SIDE };
    default:
      return null;
  }
}

/**
 * Build a Point FeatureCollection of pip symbols for a fronts GeoJSON layer.
 * Front types with no standard pip (e.g. TROUGH) are skipped — those stay
 * dashed-line-only.
 */
export function buildFrontPipPoints(geoJSON) {
  const features = [];
  for (const feature of geoJSON?.features || []) {
    const frontType = feature?.properties?.frontType;
    if (!frontType || frontType === 'TROUGH') continue;

    const lines = lineStringsOf(feature.geometry);
    let idx = 0;
    for (const coords of lines) {
      const samples = sampleLine(coords, PIP_SPACING_KM);
      for (const sample of samples) {
        const pip = pipForIndex(frontType, idx);
        idx += 1;
        if (!pip) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: sample.lngLat },
          properties: {
            icon: pip.icon,
            bearing: normalizeBearing(sample.bearing + pip.side),
          },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

// Pip shapes are drawn pointing "up" (bearing 0), base flush with the
// bottom edge of the viewBox, so `icon-anchor: 'bottom'` sits the flat edge
// on the line and `icon-rotate` swings the bulge to whichever side.
const TRIANGLE_PATH = 'M18 30 L4 30 L11 8 Z';
const SEMICIRCLE_PATH = 'M4 30 A7 7 0 0 1 18 30 Z';

export const FRONT_ICON_DEFS = {
  'sentinel-front-triangle-blue':      { path: TRIANGLE_PATH,   fill: '#2E6FDB' },
  'sentinel-front-semicircle-red':     { path: SEMICIRCLE_PATH, fill: '#DB2E2E' },
  'sentinel-front-triangle-purple':    { path: TRIANGLE_PATH,   fill: '#7B4FA6' },
  'sentinel-front-semicircle-purple':  { path: SEMICIRCLE_PATH, fill: '#7B4FA6' },
};

// Same reds/blues used by the warm/cold pips, so a stationary front's line
// color always matches the symbol sitting on that stretch of it.
const STATIONARY_RED = '#DB2E2E';
const STATIONARY_BLUE = '#2E6FDB';

/**
 * Build the alternating red/blue line segments for stationary fronts — one
 * segment per pip, split at the same arc-length spacing used to place the
 * pips, so each colored stretch of line lines up with the shape sitting on
 * it (red under each semicircle, blue under each triangle).
 */
export function buildStationaryLineSegments(geoJSON) {
  const features = [];
  for (const feature of geoJSON?.features || []) {
    if (feature?.properties?.frontType !== 'STATIONARY') continue;

    for (const coords of lineStringsOf(feature.geometry)) {
      if (coords.length < 2) continue;
      const pipCount = sampleLine(coords, PIP_SPACING_KM).length;
      const boundaries = Array.from(
        { length: Math.max(pipCount - 1, 0) },
        (_, i) => PIP_SPACING_KM * (i + 1)
      );
      const segments = splitLineByDistances(coords, boundaries);
      segments.forEach((segCoords, i) => {
        if (segCoords.length < 2) return;
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: segCoords },
          properties: {
            frontType: 'STATIONARY',
            color: i % 2 === 0 ? STATIONARY_RED : STATIONARY_BLUE,
          },
        });
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function buildIconSvg({ path, fill }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 32" width="22" height="32">
    <path d="${path}" fill="${fill}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
  </svg>`;
}
