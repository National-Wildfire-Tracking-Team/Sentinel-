/**
 * radiusFilter.js
 * Geographic filtering against a circle (center + radius in miles) — used by
 * "Go to My Current Location" to keep only the incidents, NWS alerts, and
 * SPC/WPC outlook polygons that actually touch the user's Home Setup radius.
 *
 * The circle is the only boundary: map viewport, state, county, and ZIP are
 * never used. There is deliberately no default radius — callers must pass
 * the one the user chose in Home Setup.
 */

const EARTH_RADIUS_MI = 3958.8;
const MILES_PER_DEG_LAT = 69.0;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in miles between two lat/lng points. */
export function haversineMiles(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

function isValidCircle(lat, lng, radius) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && Number.isFinite(radius) && radius > 0;
}

// Local flat projection (miles) centered on the circle. Accurate to well
// under 1% at the few-hundred-mile scale Home Setup radii live at, and far
// cheaper than great-circle math on every polygon vertex.
function makeProjector(lat0, lng0) {
  const milesPerDegLng = MILES_PER_DEG_LAT * Math.cos(toRad(lat0));
  return ([lng, lat]) => {
    let dLng = lng - lng0;
    if (dLng > 180) dLng -= 360;
    if (dLng < -180) dLng += 360;
    return [dLng * milesPerDegLng, (lat - lat0) * MILES_PER_DEG_LAT];
  };
}

/** Squared distance from the origin to segment a→b (projected miles). */
function originToSegmentDistSq([ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? -(ax * dx + ay * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx;
  const py = ay + t * dy;
  return px * px + py * py;
}

/** Ray-cast: is the origin inside this projected ring? */
function originInRing(ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > 0) !== (yj > 0) && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function lineNearOrigin(line, rSq) {
  if (line.length === 1) {
    const [x, y] = line[0];
    return x * x + y * y <= rSq;
  }
  for (let i = 1; i < line.length; i++) {
    if (originToSegmentDistSq(line[i - 1], line[i]) <= rSq) return true;
  }
  return false;
}

/** Polygon (outer ring + holes) intersects the circle at the origin. */
function polygonIntersects(rings, rSq) {
  if (!rings?.length) return false;
  // Any ring edge within the radius means the boundary crosses the circle.
  if (rings.some((ring) => lineNearOrigin(ring, rSq))) return true;
  // Otherwise the circle is either wholly inside or wholly outside: the
  // center must be inside the outer ring and not inside any hole.
  return originInRing(rings[0]) && !rings.slice(1).some(originInRing);
}

function bboxOf(geometry, acc = [Infinity, Infinity, -Infinity, -Infinity]) {
  const visit = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < acc[0]) acc[0] = c[0];
      if (c[1] < acc[1]) acc[1] = c[1];
      if (c[0] > acc[2]) acc[2] = c[0];
      if (c[1] > acc[3]) acc[3] = c[1];
      return;
    }
    c.forEach(visit);
  };
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries?.forEach((g) => g && bboxOf(g, acc));
  } else if (geometry.coordinates) {
    visit(geometry.coordinates);
  }
  return acc;
}

/**
 * True if a GeoJSON geometry (Point, LineString, Polygon, their Multi*
 * variants, or a GeometryCollection) touches the circle.
 */
export function geometryIntersectsCircle(geometry, lat, lng, radiusMiles) {
  if (!geometry || !isValidCircle(lat, lng, radiusMiles)) return false;

  // Cheap bounding-box reject before any per-vertex work. Skipped near the
  // antimeridian, where a lng-only bbox test would give false negatives.
  const [minLng, minLat, maxLng, maxLat] = bboxOf(geometry);
  if (!Number.isFinite(minLng)) return false;
  const padLat = radiusMiles / MILES_PER_DEG_LAT;
  const padLng = radiusMiles / (MILES_PER_DEG_LAT * Math.max(0.01, Math.cos(toRad(lat))));
  if (lat + padLat < minLat || lat - padLat > maxLat) return false;
  if (maxLng - minLng < 180 && Math.abs(lng) < 170
    && (lng + padLng < minLng || lng - padLng > maxLng)) return false;

  const project = makeProjector(lat, lng);
  const rSq = radiusMiles * radiusMiles;
  const ring = (coords) => coords.map(project);
  const { type, coordinates } = geometry;

  switch (type) {
    case 'Point':
      return haversineMiles(lat, lng, coordinates[1], coordinates[0]) <= radiusMiles;
    case 'MultiPoint':
      return coordinates.some(([pLng, pLat]) => haversineMiles(lat, lng, pLat, pLng) <= radiusMiles);
    case 'LineString':
      return lineNearOrigin(ring(coordinates), rSq);
    case 'MultiLineString':
      return coordinates.some((line) => lineNearOrigin(ring(line), rSq));
    case 'Polygon':
      return polygonIntersects(coordinates.map(ring), rSq);
    case 'MultiPolygon':
      return coordinates.some((poly) => polygonIntersects(poly.map(ring), rSq));
    case 'GeometryCollection':
      return (geometry.geometries || []).some((g) => geometryIntersectsCircle(g, lat, lng, radiusMiles));
    default:
      return false;
  }
}

/**
 * Coordinates for an incident in any of the shapes the app passes around:
 * sidebar incident objects ({ lat, lng }), { latitude, longitude }, or a
 * GeoJSON Feature.
 */
function incidentGeometry(incident) {
  if (!incident) return null;
  if (incident.type === 'Feature') return incident.geometry || null;
  const lat = Number(incident.lat ?? incident.latitude);
  const lng = Number(incident.lng ?? incident.longitude);
  // (0, 0) is how upstream feeds mark "no coordinates" — never a real fire.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { type: 'Point', coordinates: [lng, lat] };
}

const toFeatureArray = (input) => (
  Array.isArray(input) ? input : (input?.features || [])
);

/**
 * Keep only the incidents, NWS alerts, and SPC/WPC outlook polygons that
 * geographically affect the circle around (userLatitude, userLongitude).
 *
 * - incidents: array of incident objects or GeoJSON Features; kept when the
 *   incident point (or perimeter geometry) falls within/touches the radius.
 * - nwsAlerts: array of normalized NWS alerts ({ geometry }); kept when the
 *   alert's affected area intersects the radius. Alerts with no resolved
 *   geometry can't be placed and are left out.
 * - spcOutlooks / wpcOutlooks: FeatureCollections or Feature arrays; kept
 *   when the outlook polygon intersects the radius.
 *
 * With no valid center or radius, every list comes back empty — callers
 * must supply the user's Home Setup radius rather than rely on a default.
 *
 * @returns {{ incidents: Array, nwsAlerts: Array, spcOutlooks: Array, wpcOutlooks: Array }}
 */
export function filterByRadius({
  userLatitude,
  userLongitude,
  selectedRadius,
  incidents = [],
  nwsAlerts = [],
  spcOutlooks = [],
  wpcOutlooks = [],
}) {
  const lat = Number(userLatitude);
  const lng = Number(userLongitude);
  const radius = Number(selectedRadius);
  if (!isValidCircle(lat, lng, radius)) {
    return { incidents: [], nwsAlerts: [], spcOutlooks: [], wpcOutlooks: [] };
  }
  const touches = (geometry) => geometryIntersectsCircle(geometry, lat, lng, radius);

  return {
    incidents: toFeatureArray(incidents).filter((inc) => touches(incidentGeometry(inc))),
    nwsAlerts: (nwsAlerts || []).filter((a) => touches(a?.geometry)),
    spcOutlooks: toFeatureArray(spcOutlooks).filter((f) => touches(f?.geometry)),
    wpcOutlooks: toFeatureArray(wpcOutlooks).filter((f) => touches(f?.geometry)),
  };
}

/** Filter a GeoJSON FeatureCollection to features touching the circle. */
export function filterFeatureCollectionByRadius(fc, lat, lng, radiusMiles) {
  if (!fc?.features) return fc;
  return {
    ...fc,
    features: fc.features.filter((f) => geometryIntersectsCircle(f.geometry, lat, lng, radiusMiles)),
  };
}

/** A GeoJSON Polygon approximating the circle, for drawing it on the map. */
export function circlePolygon(lat, lng, radiusMiles, steps = 96) {
  const coords = [];
  const angular = radiusMiles / EARTH_RADIUS_MI;
  const latR = toRad(lat);
  const lngR = toRad(lng);
  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * i) / steps;
    const pLat = Math.asin(Math.sin(latR) * Math.cos(angular)
      + Math.cos(latR) * Math.sin(angular) * Math.cos(bearing));
    const pLng = lngR + Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latR),
      Math.cos(angular) - Math.sin(latR) * Math.sin(pLat),
    );
    coords.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

/** Map zoom that roughly fits a circle of this radius on screen. */
export function zoomForRadius(lat, radiusMiles, viewportPx = 520) {
  const metersPerPxAtZ0 = 156543.03 * Math.cos(toRad(lat));
  const targetMetersPerPx = (radiusMiles * 2 * 1609.34) / viewportPx;
  return Math.max(3, Math.min(14, Math.log2(metersPerPxAtZ0 / targetMetersPerPx)));
}
