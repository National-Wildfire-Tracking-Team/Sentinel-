/**
 * hafs.js
 * Client for HAFS hurricane-model fields on the Models tab (cloud/hafs):
 * the catalog of runs and storms, one run's frames, and frame URLs.
 *
 * Frames use the Models tab's 8-bit encoding (byte 0 = no data, 1..255 =
 * the field's range), so they're coloured by the same `raster-color` paint
 * (modelFields.rasterPaint) and legend maths. Unlike HRRR/GFS, frames are
 * rendered on demand by the service, and each forecast hour has its own
 * corners: the storm nest moves with the storm.
 *
 * Opt-in like the other data services: HAFS isn't offered unless
 * VITE_HAFS_URL is set (https://<distribution>/hafs).
 */

export const HAFS_URL = import.meta.env.VITE_HAFS_URL || null;

const SCHEMA_VERSION = 1;
const TIMEOUT_MS = 20 * 1000;

export function hafsBase(baseUrl = HAFS_URL) {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/v1` : null;
}

async function getJson(url, what) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error(`HAFS ${what} is unreachable`);
  }
  if (!res.ok) {
    let message = `HAFS ${what} unavailable (HTTP ${res.status})`;
    try {
      message = (await res.json())?.error?.message || message;
    } catch {
      // not JSON: keep the status message
    }
    throw new Error(message);
  }
  return res.json();
}

export async function fetchHafsCatalog(baseUrl = HAFS_URL) {
  const base = hafsBase(baseUrl);
  if (!base) throw new Error('HAFS is not configured for this build');
  return parseHafsCatalog(await getJson(`${base}/catalog`, 'catalog'));
}

export async function fetchHafsRun({ model, cycle, storm }, baseUrl = HAFS_URL) {
  const base = hafsBase(baseUrl);
  if (!base) throw new Error('HAFS is not configured for this build');
  return parseHafsRun(await getJson(`${base}/runs/${model}/${cycle}/${storm}`, 'run'));
}

export function parseHafsCatalog(body) {
  if (!body || body.schemaVersion !== SCHEMA_VERSION || body.kind !== 'hafs-catalog') {
    throw new Error('Unexpected HAFS catalog');
  }
  if (!Array.isArray(body.models) || !Array.isArray(body.fields)) throw new Error('Incomplete HAFS catalog');
  return body;
}

export function parseHafsRun(body) {
  if (!body || body.schemaVersion !== SCHEMA_VERSION || body.kind !== 'hafs-run') {
    throw new Error('Unexpected HAFS run');
  }
  if (!body.domains || !body.cycle) throw new Error('Incomplete HAFS run');
  return body;
}

const pathSafe = (s) => /^[A-Za-z0-9]{1,32}$/.test(String(s));

/** URL of one frame, or null if any part isn't a plain id. */
export function hafsFrameUrl(base, { model, cycle, storm, domain, field, hour }) {
  if (!base || ![model, cycle, storm, domain, field].every(pathSafe) || !Number.isInteger(hour)) return null;
  return `${base}/frames/${model}/${cycle}/${storm}/${domain}/${field}/${hour}.png`;
}
