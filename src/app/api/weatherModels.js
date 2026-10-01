/**
 * weatherModels.js
 * Client for the Sentinel Weather Models service (cloud/weather-models):
 * normalized NOAA HRRR and GFS point forecasts read server-side from the
 * dynamical.org Icechunk datasets on AWS Open Data.
 *
 * The browser never touches the model datasets — only this service's small
 * JSON responses. Everything here is *model output*, kept separate from
 * observations (RAWS) and alerts (NWS/SPC): the response's `kind` is
 * checked so a model forecast can't be mistaken for anything else.
 *
 * Opt-in like the other cloud services: only used when
 * VITE_WEATHER_MODEL_SERVICE_URL is set. There is no fallback source for
 * model data, so when it's unset the Weather Models page says so.
 */

import { getCached, setCached } from '../utils/dataCache';

export const WEATHER_MODEL_SERVICE_URL = import.meta.env.VITE_WEATHER_MODEL_SERVICE_URL || null;

// The /v1 contract this client understands — see cloud/weather-models/README.md.
const SCHEMA_VERSION = 1;
const TIMEOUT_MS = 30 * 1000;
// Model runs land every 6 h; the service's own cache headers keep the edge
// fresh, so a tab only needs to re-ask every few minutes.
const FORECAST_TTL_MS = 5 * 60 * 1000;
const CATALOG_TTL_MS = 5 * 60 * 1000;

export const MODEL_IDS = ['hrrr', 'gfs'];

/** Forecast length requested per model (each model's full useful range). */
export const MODEL_HOURS = { hrrr: 48, gfs: 168 };

export class ModelServiceError extends Error {
  constructor(message, { status = 0, code = 'unavailable' } = {}) {
    super(message);
    this.name = 'ModelServiceError';
    this.status = status;
    this.code = code;
  }
}

/**
 * 0.01° (~1 km, finer than either model's grid) so nearby requests share
 * the CDN's cached response instead of each costing a dataset read.
 */
export function roundCoord(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function buildForecastUrl(baseUrl, { lat, lon, model, hours, units = 'us', variables } = {}) {
  const params = new URLSearchParams({
    lat: roundCoord(lat).toFixed(2),
    lon: roundCoord(lon).toFixed(2),
    model,
    units,
  });
  if (hours != null) params.set('hours', String(hours));
  if (variables?.length) params.set('variables', variables.join(','));
  return `${baseUrl.replace(/\/+$/, '')}/v1/forecast?${params}`;
}

/**
 * Validate a /v1/forecast body. Returns the body, or throws if it isn't a
 * model forecast in a shape this client understands.
 */
export function parseForecastResponse(body, expectedModel) {
  if (!body || typeof body !== 'object') throw new ModelServiceError('Empty response from the weather model service');
  if (body.schemaVersion !== SCHEMA_VERSION) throw new ModelServiceError('Unsupported weather model response version');
  if (body.kind !== 'model-forecast') throw new ModelServiceError('Response is not a model forecast');
  if (!body.model?.id || !body.run?.runTime || !Array.isArray(body.forecast)) {
    throw new ModelServiceError('Incomplete weather model response');
  }
  // Never show one model's numbers under another's name. `auto` may resolve
  // to either, but an explicit request must come back as that model.
  if (expectedModel && expectedModel !== 'auto' && body.model.id !== expectedModel) {
    throw new ModelServiceError(`Asked for ${expectedModel.toUpperCase()} but received ${body.model.name}`);
  }
  return body;
}

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new ModelServiceError(
      err?.name === 'TimeoutError' ? 'The weather model service took too long to respond' : 'Could not reach the weather model service',
    );
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    // fall through: a non-JSON error page
  }
  if (!res.ok) {
    throw new ModelServiceError(body?.error?.message || `Weather model service error (HTTP ${res.status})`, {
      status: res.status,
      code: body?.error?.code || 'http_error',
    });
  }
  return body;
}

/**
 * One model's point forecast.
 * @param {{ lat:number, lon:number, model:'hrrr'|'gfs'|'auto', hours?:number, units?:'us'|'si' }} req
 */
export async function fetchModelForecast(req, baseUrl = WEATHER_MODEL_SERVICE_URL) {
  if (!baseUrl) throw new ModelServiceError('Model forecasts are not configured for this build', { code: 'not_configured' });
  const hours = req.hours ?? MODEL_HOURS[req.model];
  const url = buildForecastUrl(baseUrl, { ...req, hours });
  const cached = getCached(`wm:${url}`);
  if (cached) return cached;
  const body = parseForecastResponse(await getJson(url), req.model);
  setCached(`wm:${url}`, body, FORECAST_TTL_MS);
  return body;
}

/** The model catalog: newest runs, lead hours, coverage outlines. */
export async function fetchModelCatalog(baseUrl = WEATHER_MODEL_SERVICE_URL) {
  if (!baseUrl) throw new ModelServiceError('Model forecasts are not configured for this build', { code: 'not_configured' });
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/models`;
  const cached = getCached(`wm:${url}`);
  if (cached) return cached;
  const body = await getJson(url);
  if (body?.schemaVersion !== SCHEMA_VERSION || body?.kind !== 'model-catalog' || !Array.isArray(body.models)) {
    throw new ModelServiceError('Unexpected model catalog response');
  }
  setCached(`wm:${url}`, body, CATALOG_TTL_MS);
  return body;
}
