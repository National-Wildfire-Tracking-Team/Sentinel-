/**
 * mrms.js
 * Client for the Weather tab's MRMS radar layer: the manifest the MRMS
 * builder publishes (cloud/mrms), frame URLs, and display units.
 *
 * The browser never touches NOAA's bucket or AWS. The builder reads each
 * MRMS file once and publishes small 8-bit frames to Sentinel's CDN; this
 * module only fetches those. Frames use the Models tab's encoding (byte 0 =
 * no radar coverage, 1..255 = the product's range), so they are coloured by
 * the same `raster-color` paint (modelFields.rasterPaint).
 *
 * Opt-in like the other data services: nothing is fetched, and the layer
 * isn't offered, unless VITE_MRMS_URL is set (https://<distribution>/mrms).
 */

export const MRMS_URL = import.meta.env.VITE_MRMS_URL || null;

const SCHEMA_VERSION = 1;
const TIMEOUT_MS = 15 * 1000;
/** The builder runs every 2 min; a manifest this old means the pipeline has stopped. */
export const MANIFEST_STALE_MS = 10 * 60 * 1000;

export function mrmsBase(baseUrl = MRMS_URL) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/v1` : null;
}

export async function fetchMrmsManifest(baseUrl = MRMS_URL) {
  const base = mrmsBase(baseUrl);
  if (!base) throw new Error('MRMS is not configured for this build');
  let res;
  try {
    res = await fetch(`${base}/manifest.json`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-cache' });
  } catch {
    throw new Error('MRMS radar is unreachable');
  }
  if (!res.ok) throw new Error(`MRMS radar unavailable (HTTP ${res.status})`);
  return parseMrmsManifest(await res.json());
}

export function parseMrmsManifest(body) {
  if (!body || body.schemaVersion !== SCHEMA_VERSION || body.kind !== 'mrms-manifest') {
    throw new Error('Unexpected MRMS manifest');
  }
  if (!body.products || !body.image?.coordinates || !body.image?.levels) {
    throw new Error('Incomplete MRMS manifest');
  }
  return body;
}

/** URL of one frame. res: 'lo' (animation, zoomed out) | 'hi' (paused, zoomed in). */
export function mrmsFrameUrl(base, manifest, productId, frameId, res = 'lo') {
  const p = manifest.products[productId];
  const level = manifest.image.levels[res] ? res : 'lo';
  return `${base}/${productId}/${p.encodingId}/${level}/${frameId}.png`;
}

export function manifestIsStale(manifest, now = Date.now()) {
  return Boolean(manifest) && now - Date.parse(manifest.generatedAt) > MANIFEST_STALE_MS;
}

// ── Display units (US, like the rest of the live map) ──

const UNITS = { reflectivity: 'dBZ', rate: 'in/h', depth: 'in', size: 'in', shear: 's⁻¹', height: 'kft' };
const DECIMALS = { reflectivity: 0, rate: 2, depth: 2, size: 2, shear: 3, height: 0 };

export function mrmsDisplayUnit(quantity) {
  return UNITS[quantity] ?? '';
}

/** Product units (as encoded by the builder) → display units. */
export function toMrmsDisplay(value, quantity) {
  if (value == null || !Number.isFinite(value)) return value;
  switch (quantity) {
    case 'rate':
    case 'depth':
    case 'size': return value / 25.4; // mm → in
    case 'shear': return value / 1000; // 10⁻³ s⁻¹ → s⁻¹
    case 'height': return value * 3.280839895; // km → kft
    default: return value;
  }
}

export function formatMrms(value, quantity) {
  if (value == null || !Number.isFinite(value)) return '—';
  return toMrmsDisplay(value, quantity).toFixed(DECIMALS[quantity] ?? 1);
}

/** Legend rows for a product: each visible palette stop, in display units. */
export function mrmsLegendRows(spec) {
  const rows = [];
  for (const [value, color, alpha] of spec.palette) {
    if (alpha <= 0) continue;
    const label = formatMrms(value, spec.quantity);
    if (rows.length && rows[rows.length - 1].label === label) continue;
    rows.push({ color, label: `${label} ${mrmsDisplayUnit(spec.quantity)}` });
  }
  return rows;
}
