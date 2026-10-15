/**
 * majorRoads.js
 * Nearest major road to a point, from Mapbox Tilequery over the Streets
 * tileset the map already uses. Used to pull an evacuation-zone exit onto a
 * highway or main road (see evacExit preferMajorRoads).
 *
 * Major = motorway, trunk or primary. For a line, Tilequery returns the closest
 * point on it, so the result is a spot on the road itself.
 */

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
export const MAJOR_ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary']);
export const SEARCH_RADIUS_M = 2000;

/**
 * @returns {Promise<null | { point: [lng, lat], roadClass: string, name: string | null }>}
 *   null when no major road is within radiusM, or the lookup isn't available.
 */
export async function nearestMajorRoad([lng, lat], { radiusM = SEARCH_RADIUS_M, signal, fetchImpl = fetch, token = MAPBOX_TOKEN } = {}) {
  if (!token || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const params = new URLSearchParams({
    radius: String(radiusM),
    limit: '20',
    layers: 'road',
    geometry: 'linestring',
    dedupe: 'true',
    access_token: token,
  });
  const res = await fetchImpl(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lng},${lat}.json?${params}`, { signal });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  let best = null;
  for (const f of data?.features || []) {
    const p = f?.properties || {};
    const c = f?.geometry?.coordinates;
    if (!MAJOR_ROAD_CLASSES.has(p.class) || p.structure === 'tunnel' || !Array.isArray(c)) continue;
    const distance = Number(p.tilequery?.distance);
    if (!best || distance < best.distance) best = { point: [c[0], c[1]], roadClass: p.class, name: p.name || p.ref || null, distance };
  }
  return best && { point: best.point, roadClass: best.roadClass, name: best.name };
}
