/**
 * modelFields.js
 * Client for the Models tab's spatial fields: the manifest the field builder
 * publishes (cloud/weather-models/fields), frame URLs, and the Mapbox
 * `raster-color` expressions that turn 8-bit frames into colour.
 *
 * Frames are static, immutable PNGs on the CDN. Each one is an 8-bit
 * greyscale image: byte 0 = no data, 1..255 = the variable's encoded range.
 * The colour scale is applied here, in the browser, so units and palettes
 * change without new images. Frames are for display only; values a user
 * reads come from the point API at full precision.
 */

import { WEATHER_MODEL_SERVICE_URL } from './weatherModels';

const SCHEMA_VERSION = 1;
const TIMEOUT_MS = 15 * 1000;

export function fieldsBase(baseUrl = WEATHER_MODEL_SERVICE_URL) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/fields/v1` : null;
}

export async function fetchFieldManifest(baseUrl = WEATHER_MODEL_SERVICE_URL) {
  const base = fieldsBase(baseUrl);
  if (!base) throw new Error('Model fields are not configured for this build');
  const res = await fetch(`${base}/manifest.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Model field manifest unavailable (HTTP ${res.status})`);
  const manifest = parseFieldManifest(await res.json());
  writeCachedManifest(manifest, base);
  return manifest;
}

// One manifest request at a time, shared by the idle prefetch, the tab's
// hover warm-up and the tab itself. Reused for SHARE_MS, then refetched.
const SHARE_MS = 30 * 1000;
let shared = null;

/** fetchFieldManifest, deduplicated: callers within SHARE_MS get the same promise. */
export function loadFieldManifest(baseUrl = WEATHER_MODEL_SERVICE_URL) {
  if (shared && shared.baseUrl === baseUrl && Date.now() - shared.at < SHARE_MS) return shared.promise;
  const promise = fetchFieldManifest(baseUrl);
  shared = { baseUrl, at: Date.now(), promise };
  promise.catch(() => { if (shared?.promise === promise) shared = null; });
  return promise;
}

// The last manifest, kept on this device so the tab draws immediately on the
// next visit while a fresh one loads. Past CACHED_MAX_MS it's not used: by
// then a newer run has usually replaced it.
const CACHE_KEY = 'sentinel:model-field-manifest:v1';
const CACHED_MAX_MS = 6 * 60 * 60 * 1000;

export function readCachedManifest(baseUrl = WEATHER_MODEL_SERVICE_URL, now = Date.now()) {
  const base = fieldsBase(baseUrl);
  if (!base) return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(CACHE_KEY));
    if (!saved || saved.base !== base || !(now - saved.savedAt < CACHED_MAX_MS)) return null;
    return parseFieldManifest(saved.manifest);
  } catch {
    return null;
  }
}

function writeCachedManifest(manifest, base) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ base, savedAt: Date.now(), manifest }));
  } catch {
    // storage full or blocked: the next visit just waits for the network
  }
}

/** Open the connection to the fields CDN early, so the first frame doesn't pay for DNS + TLS. */
export function preconnectFields(baseUrl = WEATHER_MODEL_SERVICE_URL) {
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return;
  }
  if (origin === window.location.origin || document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = 'anonymous'; // frames are fetched in CORS mode without credentials
  document.head.appendChild(link);
}

export function parseFieldManifest(body) {
  if (!body || body.schemaVersion !== SCHEMA_VERSION || body.kind !== 'model-field-manifest') {
    throw new Error('Unexpected model field manifest');
  }
  if (!body.models?.hrrr?.current || !body.models?.gfs?.current || !body.variables) {
    throw new Error('Incomplete model field manifest');
  }
  return body;
}

const pad3 = (n) => String(n).padStart(3, '0');
const validId = (iso) => `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;

/** URL of one field frame. res: 'lo' | 'hi' (hi exists for HRRR only). */
export function fieldUrl(base, manifest, model, variable, hour, res = 'lo') {
  const m = manifest.models[model];
  const level = m.image.levels[res] ? res : 'lo';
  return `${base}/${model}/${m.current.id}/${variable}/${level}/${pad3(hour)}.png`;
}

export function windUrl(base, manifest, model, hour) {
  return `${base}/${model}/${manifest.models[model].current.id}/wind/${pad3(hour)}.png`;
}

export function differenceUrl(base, manifest, variable, validTime) {
  return `${base}/diff/${manifest.difference.id}/${variable}/${validId(validTime)}.png`;
}

/** Forecast hour of a valid time in a model's current run, or null if that run has no such frame. */
export function hourAt(manifest, model, validTime) {
  const cur = manifest.models[model]?.current;
  const i = cur ? cur.validTimes.indexOf(validTime) : -1;
  return i === -1 ? null : cur.hours[i];
}

// ── Encoding & colour ──

/** SI value → encoded byte (inverse of the builder's encode_bytes, without rounding). */
export function valueToByte(value, { lo, hi, transform }) {
  const v = Math.min(Math.max(value, lo), hi);
  const t = transform === 'sqrt' ? Math.sqrt(v - lo) / Math.sqrt(hi - lo) : (v - lo) / (hi - lo);
  return 1 + t * 254;
}

export function byteToValue(byte, { lo, hi, transform }) {
  const t = (byte - 1) / 254;
  return transform === 'sqrt' ? lo + (t * Math.sqrt(hi - lo)) ** 2 : lo + t * (hi - lo);
}

function rgba(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Mapbox raster paint for an 8-bit field frame. `raster-color-mix` reads the
 * byte from the red channel; byte 0 (no data) is transparent.
 */
export function rasterPaint({ encoding, palette }, opacity = 1) {
  const stops = [];
  let last = 0.5;
  for (const [value, hex, alpha] of palette) {
    let b = valueToByte(value, encoding);
    if (b <= last) b = last + 1e-3; // interpolate needs strictly ascending stops
    stops.push(b, rgba(hex, alpha));
    last = b;
  }
  return {
    'raster-color': ['interpolate', ['linear'], ['raster-value'], 0, 'rgba(0, 0, 0, 0)', 0.5, 'rgba(0, 0, 0, 0)', ...stops],
    'raster-color-mix': [255, 0, 0, 0],
    'raster-color-range': [0, 255],
    'raster-resampling': 'linear',
    'raster-fade-duration': 0,
    'raster-opacity': opacity,
  };
}

// ── Display units ──

export const DISPLAY_UNITS = {
  us: { temperature: '°F', percent: '%', speed: 'mph', rate: 'in/h', depth: 'in', pressure: 'hPa', reflectivity: 'dBZ' },
  si: { temperature: '°C', percent: '%', speed: 'm/s', rate: 'mm/h', depth: 'mm', pressure: 'hPa', reflectivity: 'dBZ' },
};

/** SI → display units. `delta` converts a difference (no °F offset). */
export function toDisplay(value, quantity, units = 'us', { delta = false } = {}) {
  if (value == null || !Number.isFinite(value) || units === 'si') return value;
  switch (quantity) {
    case 'temperature': return delta ? value * 9 / 5 : value * 9 / 5 + 32;
    case 'speed': return value * 2.2369362920544;
    case 'rate':
    case 'depth': return value / 25.4;
    default: return value;
  }
}

export function formatDisplay(value, quantity) {
  if (value == null || !Number.isFinite(value)) return '—';
  const decimals = quantity === 'rate' || quantity === 'depth' ? 2 : 0;
  const rounded = Number(value.toFixed(decimals));
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(decimals);
}
