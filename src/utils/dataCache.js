/**
 * dataCache.js
 * Simple in-memory TTL cache to throttle API requests.
 * Each cache entry stores the data + an expiry timestamp.
 */

const cache = new Map();

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

  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  setCached(cacheKey, data, ttlMs);
  return data;
}
