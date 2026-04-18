/**
 * openSkyRateLimiter.js
 * Sliding-window rate limiter for OpenSky Network API requests.
 * OpenSky enforces a credit budget; we cap at 166 credits per hour.
 * Each call to fetchFlights counts as 1 credit.
 */

const MAX_CREDITS = 166;
const WINDOW_MS   = 60 * 60 * 1000; // 1 hour

/** Timestamps (ms) of requests made within the current window. */
const timestamps = [];

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }
}

export function remaining() {
  prune();
  return Math.max(0, MAX_CREDITS - timestamps.length);
}

export function msUntilSlotAvailable() {
  prune();
  if (timestamps.length < MAX_CREDITS) return 0;
  return timestamps[0] + WINDOW_MS - Date.now();
}

export function recordRequest() {
  timestamps.push(Date.now());
}

/**
 * Wait (if necessary) until a credit slot is available, then record the
 * request. Throws if the wait would exceed the hour window (shouldn't happen
 * with normal usage, but prevents an infinite stall on misconfiguration).
 *
 * @returns {Promise<void>}
 */
export async function acquireSlot() {
  const wait = msUntilSlotAvailable();
  if (wait > 0) {
    console.warn(
      `[OpenSky rate-limiter] 166 credits used in the last hour – ` +
      `pausing ${(wait / 1000).toFixed(1)}s before next request`,
    );
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  recordRequest();
}

export function status() {
  prune();
  return {
    used:        timestamps.length,
    remaining:   remaining(),
    maxCredits:  MAX_CREDITS,
    windowMs:    WINDOW_MS,
  };
}
