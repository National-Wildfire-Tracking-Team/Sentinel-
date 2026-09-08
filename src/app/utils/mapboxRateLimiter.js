/**
 * mapboxRateLimiter.js
 * Sliding-window rate limiter for Mapbox API requests.
 *
 * Caps at 6 000 requests per minute to stay within the Mapbox rate limit.
 */

import { createRateLimiter } from './rateLimiter';

const limiter = createRateLimiter({
  maxRequests: 6000,
  windowMs: 60 * 1000, // 1 minute
  label: 'Mapbox',
});

export const { remaining, msUntilSlotAvailable, recordRequest, acquireSlot, status } = limiter;
