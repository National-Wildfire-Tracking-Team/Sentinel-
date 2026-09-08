/**
 * hrrRateLimiter.js
 * Sliding-window rate limiter for NOAA NOMADS HRRR WMS tile requests.
 *
 * Caps at 9 999 requests per day (rolling 24-hour window) to avoid
 * overwhelming the NOAA NOMADS server.
 */

import { createRateLimiter } from './rateLimiter';

const limiter = createRateLimiter({
  maxRequests: 9999,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  label: 'HRRR',
});

export const { remaining, msUntilSlotAvailable, recordRequest, acquireSlot, tryAcquire, status } = limiter;
