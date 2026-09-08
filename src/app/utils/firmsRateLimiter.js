/**
 * firmsRateLimiter.js
 * Sliding-window rate limiter for NASA FIRMS API requests.
 *
 * NASA FIRMS enforces a limit of ~5 000 requests per 10 minutes per MAP key.
 * We cap at 4 999 to stay safely under that ceiling.
 */

import { createRateLimiter } from './rateLimiter';

const limiter = createRateLimiter({
  maxRequests: 4999,
  windowMs: 10 * 60 * 1000, // 10 minutes
  label: 'FIRMS',
});

export const { remaining, msUntilSlotAvailable, recordRequest, acquireSlot, status } = limiter;
