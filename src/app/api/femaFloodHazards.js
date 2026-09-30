/**
 * FEMA National Flood Hazard Layer (NFHL) — flood hazard zones, FIRM panels,
 * and NFHL availability for the current viewport.
 *
 * Always served through Sentinel's own fema-nfhl-proxy Cloud Run service
 * (cloud/fema-nfhl-proxy) — the browser never calls FEMA directly, so there
 * is deliberately no direct-to-ArcGIS fallback here. Until
 * VITE_FEMA_NFHL_PROXY_URL is set the layer reports itself unavailable.
 */

import { floodLevelForZoom } from '../utils/floodHazard';

const PROXY_URL = (import.meta.env.VITE_FEMA_NFHL_PROXY_URL || '').replace(/\/+$/, '') || null;

export const EMPTY_FLOOD_DATA = Object.freeze({
  level: null,
  zones: { type: 'FeatureCollection', features: [] },
  panels: { type: 'FeatureCollection', features: [] },
  availability: { type: 'FeatureCollection', features: [] },
  attribution: null,
  truncated: false,
});

/** Fresh for this long; after that, served immediately and refetched in the background. */
const FRESH_MS = 15 * 60 * 1000;
/** Dropped entirely after this long. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;
/**
 * Tiles per axis per request — keeps requests under the server's 64-tile
 * extent limit (MAX_TILES_PER_DATASET) on very large screens by trimming the
 * far edges of the buffer instead of getting rejected outright.
 */
export const MAX_TILES_PER_AXIS = 8;

/** @type {Map<string, { data: object, fetchedAt: number }>} */
const cache = new Map();
/** @type {Map<string, Promise<object>>} */
const inFlight = new Map();

export class FloodHazardError extends Error {
  constructor(message, { status = null, retryable = true } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export function isFloodHazardServiceConfigured() {
  return Boolean(PROXY_URL);
}

function lngToTileX(lng, z) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z);
}

function tileLng(x, z) {
  return (x / 2 ** z) * 360 - 180;
}

function tileLat(y, z) {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
}

function centerClamp(lo, hi) {
  const span = hi - lo + 1;
  if (span <= MAX_TILES_PER_AXIS) return [lo, hi];
  const start = lo + Math.floor((span - MAX_TILES_PER_AXIS) / 2);
  return [start, start + MAX_TILES_PER_AXIS - 1];
}

/**
 * Snap bounds outward to the server's tile grid for this zoom's level. Every
 * viewport inside the same block of tiles produces the same request — so the
 * client cache, the browser HTTP cache, and the server's tile cache all line
 * up on one key instead of fragmenting per pixel of panning.
 *
 * @returns {{ key: string, bbox: object, level: string } | null}
 */
export function snapFloodRequest(bounds, zoom) {
  const level = floodLevelForZoom(zoom);
  if (!level || !bounds) return null;
  const z = level.tileZoom;
  const max = 2 ** z - 1;
  const clamp = (v) => Math.min(max, Math.max(0, v));
  let x0 = clamp(lngToTileX(bounds.west, z));
  let x1 = clamp(lngToTileX(bounds.east - 1e-9, z));
  let y0 = clamp(latToTileY(bounds.north, z));
  let y1 = clamp(latToTileY(bounds.south + 1e-9, z));
  [x0, x1] = centerClamp(x0, x1);
  [y0, y1] = centerClamp(y0, y1);
  // Shrink by a hair so the snapped edges don't touch the neighbouring tiles.
  const inset = 1e-7;
  const bbox = {
    west: tileLng(x0, z) + inset,
    east: tileLng(x1 + 1, z) - inset,
    north: tileLat(y0, z) - inset,
    south: tileLat(y1 + 1, z) + inset,
  };
  return { key: `${level.name}:${z}:${x0}-${x1}:${y0}-${y1}`, bbox, level: level.name };
}

async function fetchFromProxy({ bbox }, zoom) {
  const params = new URLSearchParams({
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north].map((n) => n.toFixed(6)).join(','),
    zoom: String(Math.round(zoom * 100) / 100),
  });
  let res;
  try {
    res = await fetch(`${PROXY_URL}/flood-hazards?${params}`);
  } catch {
    throw new FloodHazardError('Flood hazard data is temporarily unavailable.');
  }
  if (!res.ok) {
    // 4xx are our own validation messages (safe to show); 5xx get a generic one.
    let message = 'Flood hazard data is temporarily unavailable.';
    if (res.status >= 400 && res.status < 500) {
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch { /* keep generic */ }
    }
    throw new FloodHazardError(message, { status: res.status, retryable: res.status >= 500 || res.status === 429 });
  }
  const json = await res.json();
  return {
    level: json.level ?? null,
    zones: json.zones?.features ? json.zones : EMPTY_FLOOD_DATA.zones,
    panels: json.panels?.features ? json.panels : EMPTY_FLOOD_DATA.panels,
    availability: json.availability?.features ? json.availability : EMPTY_FLOOD_DATA.availability,
    attribution: json.attribution ?? null,
    truncated: Boolean(json.truncated),
    stale: Boolean(json.stale),
  };
}

function load(snapped, zoom) {
  let pending = inFlight.get(snapped.key);
  if (!pending) {
    pending = fetchFromProxy(snapped, zoom)
      .then((data) => {
        // A stale-fallback answer from the server isn't worth caching locally.
        if (!data.stale) {
          cache.delete(snapped.key);
          while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
          cache.set(snapped.key, { data, fetchedAt: Date.now() });
        }
        return data;
      })
      .finally(() => inFlight.delete(snapped.key));
    inFlight.set(snapped.key, pending);
  }
  return pending;
}

/**
 * Synchronous cache read — lets the hook paint cached data on the same frame
 * the map settles, before any network round-trip.
 * @returns {{ data: object, fresh: boolean } | null}
 */
export function peekFloodHazards(bounds, zoom) {
  const snapped = snapFloodRequest(bounds, zoom);
  if (!snapped) return null;
  const entry = cache.get(snapped.key);
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt;
  if (age > MAX_AGE_MS) {
    cache.delete(snapped.key);
    return null;
  }
  return { data: entry.data, fresh: age < FRESH_MS };
}

/**
 * @param {{ west: number, south: number, east: number, north: number }} bounds WGS84 degrees
 * @param {number} zoom Mapbox map zoom
 * @param {{ force?: boolean }} [options] force bypasses the fresh-cache check (manual retry/refresh)
 */
export async function fetchFloodHazardsInBounds(bounds, zoom, { force = false } = {}) {
  if (!PROXY_URL) {
    throw new FloodHazardError('Flood hazard data is not configured for this deployment.', { retryable: false });
  }
  const snapped = snapFloodRequest(bounds, zoom);
  if (!snapped) return EMPTY_FLOOD_DATA;
  if (!force) {
    const cached = peekFloodHazards(bounds, zoom);
    if (cached?.fresh) return cached.data;
  }
  return load(snapped, zoom);
}

/** Test hook. */
export function __clearFloodHazardCache() {
  cache.clear();
  inFlight.clear();
}
