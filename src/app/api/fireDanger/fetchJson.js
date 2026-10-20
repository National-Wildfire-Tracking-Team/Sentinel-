/**
 * fetchJson.js
 * Shared fetch for the Fire Danger & Fuels sources: in-memory cache with
 * in-flight dedupe (dataCache), a timeout, one quick retry, and no caching
 * of failures. ArcGIS reports many errors as HTTP 200 with an `error` body;
 * those are treated as failures so a bad response is never cached as data.
 */

import { getCached, setCached, dedupeInflight } from '../../utils/dataCache';

export const FETCH_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 1500;

async function fetchOnce(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid JSON response');
  }
  if (data?.error) throw new Error(data.error.message || 'Upstream service error');
  return data;
}

/**
 * @param {string} url
 * @param {string} cacheKey
 * @param {number} ttlMs
 * @param {{ timeoutMs?: number, retryDelayMs?: number }} [opts]
 */
export async function fetchJson(url, cacheKey, ttlMs, { timeoutMs = FETCH_TIMEOUT_MS, retryDelayMs = RETRY_DELAY_MS } = {}) {
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  return dedupeInflight(cacheKey, async () => {
    let data;
    try {
      data = await fetchOnce(url, timeoutMs);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      data = await fetchOnce(url, timeoutMs);
    }
    setCached(cacheKey, data, ttlMs);
    return data;
  });
}
