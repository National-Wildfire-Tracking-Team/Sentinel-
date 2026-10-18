/**
 * lightning.js
 * Client for the Weather and All Hazards tabs' Lightning layer: the rolling
 * file of the last 15 minutes of GOES GLM flashes that the lightning builder
 * publishes (cloud/lightning) to Sentinel's CDN, refreshed every minute.
 *
 * The browser never touches NOAA's buckets or AWS: the builder reads each
 * 20-second GLM file once and publishes one small gzipped JSON file.
 *
 * Opt-in like the other data services: nothing is fetched unless
 * VITE_LIGHTNING_URL is set (https://<distribution>/lightning).
 */

export const LIGHTNING_URL = import.meta.env.VITE_LIGHTNING_URL || null;

const SCHEMA_VERSION = 1;
const TIMEOUT_MS = 15 * 1000;
const COORD_SCALE = 100;

/** Flash age bands (minutes), newest first: map colour and legend. */
export const LIGHTNING_AGES = [
  { maxMin: 2, color: '#ffffff', label: 'Under 2 min' },
  { maxMin: 5, color: '#ffe14d', label: '2–5 min' },
  { maxMin: 10, color: '#ff9f1c', label: '5–10 min' },
  { maxMin: 15, color: '#ff4d2e', label: '10–15 min' },
];

export const LIGHTNING_ATTRIBUTION = 'Lightning: NOAA GOES-East/West Geostationary Lightning Mapper (GLM)';

export function lightningBase(baseUrl = LIGHTNING_URL) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/v1` : null;
}

/** latest.json → { generatedAt, windowSeconds, sources, notice, attribution, geojson } (flash times in epoch seconds). */
export function parseLightning(body) {
  if (body?.schemaVersion !== SCHEMA_VERSION) throw new Error('Lightning data is in an unexpected format');
  const { lon = [], lat = [], t = [], e = [] } = body.flashes ?? {};
  const features = new Array(t.length);
  for (let i = 0; i < t.length; i++) {
    features[i] = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon[i] / COORD_SCALE, lat[i] / COORD_SCALE] },
      properties: { t: body.base + t[i], e: e[i] ?? 0 },
    };
  }
  return {
    generatedAt: body.generatedAt ? Date.parse(body.generatedAt) : null,
    windowSeconds: body.windowSeconds ?? 900,
    sources: body.sources ?? {},
    notice: body.notice ?? '',
    attribution: body.attribution ?? LIGHTNING_ATTRIBUTION,
    geojson: { type: 'FeatureCollection', features },
  };
}

export async function fetchLightning(baseUrl = LIGHTNING_URL, { signal } = {}) {
  const base = lightningBase(baseUrl);
  if (!base) throw new Error('Lightning is not configured for this build');
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${base}/latest.json`, {
      signal: signal && AbortSignal.any ? AbortSignal.any([signal, timeout]) : (signal ?? timeout),
      cache: 'no-cache',
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error('Lightning data is unreachable', { cause: err });
  }
  if (!res.ok) throw new Error(`Lightning data unavailable (HTTP ${res.status})`);
  return parseLightning(await res.json());
}
