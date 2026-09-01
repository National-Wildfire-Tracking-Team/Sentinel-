/**
 * wpcShared.js
 * Shared fetch helper for the WPC outlook modules (ERO, WSSI, QPF, fronts).
 *
 * These mapservices.weather.noaa.gov ArcGIS endpoints are, like the ones
 * documented in noaaWaterGauge.js, occasionally slow or unresponsive rather
 * than cleanly erroring — observed directly while building this feature as
 * a hung fetch that never resolves or rejects, leaving the layer silently
 * empty until the next 5-minute refresh. A timeout (matching
 * noaaWaterGauge.js's FETCH_TIMEOUT_MS) plus a single quick retry turns that
 * into a fast, visible failure that self-heals on the next toggle/refresh
 * instead of hanging indefinitely.
 */

import { getCached, setCached } from '../utils/dataCache';

const FETCH_TIMEOUT_MS = 12000;
const RETRY_DELAY_MS = 1000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`WPC request timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a WPC ArcGIS layer query URL with caching, a timeout, and a single
 * quick retry on failure (covers a transient hang/error without waiting for
 * the next scheduled refresh).
 */
export async function fetchWpcLayer(url, cacheKey, ttlMs = 5 * 60 * 1000) {
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  let data;
  try {
    data = await fetchWithTimeout(url);
  } catch {
    await sleep(RETRY_DELAY_MS);
    data = await fetchWithTimeout(url);
  }

  setCached(cacheKey, data, ttlMs);
  return data;
}
