/**
 * mapboxRateLimiter.js
 * Sliding-window rate limiter for Mapbox API requests.
 *
 * Caps at 6 000 requests per minute to stay within the Mapbox rate limit.
 */

const MAX_REQUESTS = 6000;
const WINDOW_MS = 60 * 1000; // 1 minute

/** Timestamps (ms) of requests made within the current window. */
const timestamps = [];

/**
 * Remove timestamps older than the sliding window.
 */
function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }
}

/**
 * Return the number of requests still available in the current window.
 */
export function remaining() {
  prune();
  return Math.max(0, MAX_REQUESTS - timestamps.length);
}

/**
 * If the window is full, return the number of milliseconds the caller
 * should wait before retrying.  Returns 0 when a slot is available.
 */
export function msUntilSlotAvailable() {
  prune();
  if (timestamps.length < MAX_REQUESTS) return 0;
  // The oldest timestamp determines when the next slot opens.
  return timestamps[0] + WINDOW_MS - Date.now();
}

/**
 * Record a request and return immediately.
 * Call this **after** confirming a slot is available.
 */
export function recordRequest() {
  timestamps.push(Date.now());
}

/**
 * Wait (if necessary) until a request slot is available, then record
 * the request.  Resolves once the caller may proceed.
 *
 * @returns {Promise<void>}
 */
export async function acquireSlot() {
  const wait = msUntilSlotAvailable();
  if (wait > 0) {
    console.warn(
      `[Mapbox rate-limiter] 6 000 requests reached in the last minute – ` +
      `pausing ${(wait / 1000).toFixed(1)}s before next request`,
    );
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  recordRequest();
}

/**
 * Convenience info for debugging / UI.
 */
export function status() {
  prune();
  return {
    used: timestamps.length,
    remaining: remaining(),
    maxRequests: MAX_REQUESTS,
    windowMs: WINDOW_MS,
  };
}
