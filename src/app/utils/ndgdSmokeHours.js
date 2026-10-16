/**
 * ndgdSmokeHours.js
 * NDGD smoke forecast hours: the page picks one (the dock's Smoke tab) and
 * MapView draws only that hour's polygons.
 */

/** NDGD GeoJSON uses epoch ms in `todate` / `Todate` for the valid forecast hour */
export function ndgdFeatureToDateMs(feature) {
  const p = feature?.properties;
  if (!p) return null;
  const raw = p.todate ?? p.Todate;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Sorted unique forecast hours (epoch ms) in an NDGD smoke FeatureCollection. */
export function ndgdForecastHours(geoJSON) {
  const feats = geoJSON?.features;
  if (!feats?.length) return [];
  const seen = new Set();
  for (const f of feats) {
    const ms = ndgdFeatureToDateMs(f);
    if (ms != null) seen.add(ms);
  }
  return Array.from(seen).sort((a, b) => a - b);
}
