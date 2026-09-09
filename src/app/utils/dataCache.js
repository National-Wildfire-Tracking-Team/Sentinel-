/**
 * dataCache.js
 * Simple in-memory TTL cache to throttle API requests.
 * Each cache entry stores the data + an expiry timestamp.
 */

const cache = new Map();

// Requests currently in flight, keyed the same as the cache. Lets two
// callers that ask for the same key at nearly the same moment (e.g. two
// hooks both gated on the same "map ready" flag, firing in the same tick)
// share one network request instead of each firing their own.
const inflight = new Map();

/**
 * Get a cached value if it's still fresh.
 * @param {string} key
 * @returns {any|null}  Returns null on miss or expiry
 */
export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Store a value in the cache with a TTL.
 * @param {string} key
 * @param {any} data
 * @param {number} ttlMs  Time-to-live in milliseconds (default: 5 minutes)
 */
export function setCached(key, data, ttlMs = 5 * 60 * 1000) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Invalidate (remove) a cached entry.
 * @param {string} key
 */
export function invalidateCache(key) {
  cache.delete(key);
}

/**
 * Clear the entire cache (e.g. on manual refresh).
 */
export function clearCache() {
  cache.clear();
}

/**
 * Coalesce concurrent callers requesting the same key: the first caller's
 * async `fn` runs once; anyone else who asks for the same `key` before it
 * settles gets that same promise instead of triggering a duplicate request.
 * On rejection the key is cleared so a later call can retry.
 * @param {string} key
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>}
 */
export function dedupeInflight(key, fn) {
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve().then(fn).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/**
 * Convenience wrapper: fetch a resource with caching.
 * @param {string} url          URL to fetch
 * @param {string} cacheKey     Cache key
 * @param {object} [options]    fetch() options (headers, etc.)
 * @param {number} [ttlMs]      Cache TTL in ms
 * @returns {Promise<any>}      Parsed JSON response
 */
export async function fetchWithCache(url, cacheKey, options = {}, ttlMs = 5 * 60 * 1000) {
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  return dedupeInflight(cacheKey, async () => {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Invalid JSON response from ${url}`);
    }
    setCached(cacheKey, data, ttlMs);
    return data;
  });
}
