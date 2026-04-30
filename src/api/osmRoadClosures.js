/**
 * Temporary road closures from the OSM community API (GSoC 2025).
 * @see https://github.com/Archit1706/temporary-road-closures
 */

/** Same-origin path: Vite dev server proxies it; Netlify proxies it in production (avoids upstream CORS). */
const DEFAULT_RELATIVE_BASE = '/api/osm-closures';

function apiBase() {
  const fromEnv = import.meta.env.VITE_OSM_ROAD_CLOSURES_API;
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');
  return DEFAULT_RELATIVE_BASE;
}

/**
 * @param {{ west: number; south: number; east: number; north: number }} bounds
 * @param {{ size?: number; validOnly?: boolean }} [opts]
 * @returns {Promise<{ items: object[] }>}
 */
export async function fetchClosuresInBounds(bounds, opts = {}) {
  const { west, south, east, north } = bounds;
  const w = Number(west);
  const s = Number(south);
  const e = Number(east);
  const n = Number(north);
  if (![w, s, e, n].every(Number.isFinite)) {
    return { items: [], skipped: false };
  }

  const lonSpan = Math.abs(e - w);
  const latSpan = Math.abs(n - s);
  if (lonSpan * latSpan > 0.95) {
    return { items: [], skipped: true };
  }

  const size = Math.min(500, Math.max(1, opts.size ?? 200));
  const validOnly = opts.validOnly !== false;

  const params = new URLSearchParams({
    bbox: `${w},${s},${e},${n}`,
    size: String(size),
    valid_only: validOnly ? 'true' : 'false',
  });

  const base = apiBase();
  const qs = params.toString();
  const url = qs ? `${base}?${qs}` : base;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `closures HTTP ${res.status}`);
  }
  const data = await res.json();
  return { items: Array.isArray(data.items) ? data.items : [], skipped: false };
}

/**
 * Normalise API items to GeoJSON features for the map layer.
 * @param {object[]} items
 */
export function closuresItemsToGeoJSON(items) {
  const features = [];
  for (const row of items || []) {
    const geom = row.geometry;
    if (!geom || !geom.type || !geom.coordinates) continue;
    if (geom.type !== 'Point' && geom.type !== 'LineString') continue;
    features.push({
      type: 'Feature',
      geometry: geom,
      properties: {
        id: row.id,
        description: row.description ?? '',
        closure_type: row.closure_type ?? '',
        status: row.status ?? '',
        source: row.source ?? '',
        transport_mode: row.transport_mode ?? '',
        start_time: row.start_time ?? null,
        end_time: row.end_time ?? null,
        confidence_level: row.confidence_level ?? null,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
