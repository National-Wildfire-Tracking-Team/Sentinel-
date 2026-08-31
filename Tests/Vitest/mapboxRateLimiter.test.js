import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

describe('mapboxRateLimiter', () => {
  let remaining, msUntilSlotAvailable, recordRequest, acquireSlot, status;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import('../../src/app/utils/mapboxRateLimiter');
    remaining = mod.remaining;
    msUntilSlotAvailable = mod.msUntilSlotAvailable;
    recordRequest = mod.recordRequest;
    acquireSlot = mod.acquireSlot;
    status = mod.status;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  describe('remaining', () => {
    it('returns max requests when no requests made', () => {
      expect(remaining()).toBe(6000);
    });

    it('decreases after recording requests', () => {
      recordRequest();
      recordRequest();
      recordRequest();
      expect(remaining()).toBe(5997);
    });
  });

  describe('msUntilSlotAvailable', () => {
    it('returns 0 when slots are available', () => {
      expect(msUntilSlotAvailable()).toBe(0);
    });

    it('returns positive wait time when window is full', () => {
      for (let i = 0; i < 6000; i++) {
        recordRequest();
      }
      expect(msUntilSlotAvailable()).toBeGreaterThan(0);
    });
  });

  describe('status', () => {
    it('returns status object with correct fields', () => {
      const s = status();
      expect(s).toHaveProperty('used');
      expect(s).toHaveProperty('remaining');
      expect(s).toHaveProperty('maxRequests', 6000);
      expect(s).toHaveProperty('windowMs', 60 * 1000);
    });
  });
});
