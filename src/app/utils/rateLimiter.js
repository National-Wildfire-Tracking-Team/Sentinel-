/**
 * rateLimiter.js
 * Shared sliding-window rate limiter factory.
 *
 * firmsRateLimiter.js, hrrRateLimiter.js, and mapboxRateLimiter.js each wrap
 * an instance of this with their own limits/label, so the windowing logic
 * lives in one place instead of three copies.
 */

/**
 * @param {object} opts
 * @param {number} opts.maxRequests  Max requests allowed per window
 * @param {number} opts.windowMs     Window size in milliseconds
 * @param {string} opts.label        Used in the console.warn when throttling
 */
export function createRateLimiter({ maxRequests, windowMs, label }) {
  /** Timestamps (ms) of requests made within the current window. */
  const timestamps = [];

  function prune() {
    const cutoff = Date.now() - windowMs;
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }
  }

  function remaining() {
    prune();
    return Math.max(0, maxRequests - timestamps.length);
  }

  function msUntilSlotAvailable() {
    prune();
    if (timestamps.length < maxRequests) return 0;
    // The oldest timestamp determines when the next slot opens.
    return timestamps[0] + windowMs - Date.now();
  }

  function recordRequest() {
    timestamps.push(Date.now());
  }

  async function acquireSlot() {
    const wait = msUntilSlotAvailable();
    if (wait > 0) {
      console.warn(
        `[${label} rate-limiter] ${maxRequests} requests reached in the current window – ` +
        `pausing ${(wait / 1000).toFixed(1)}s before next request`,
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    recordRequest();
  }

  /**
   * Synchronously check whether a slot is available. If so, record the
   * request and return true. Otherwise return false without blocking.
   * Useful in contexts that cannot await (e.g. Mapbox transformRequest).
   * @returns {boolean}
   */
  function tryAcquire() {
    prune();
    if (timestamps.length >= maxRequests) return false;
    timestamps.push(Date.now());
    return true;
  }

  function status() {
    prune();
    return {
      used: timestamps.length,
      remaining: remaining(),
      maxRequests,
      windowMs,
    };
  }

  return { remaining, msUntilSlotAvailable, recordRequest, acquireSlot, tryAcquire, status };
}
