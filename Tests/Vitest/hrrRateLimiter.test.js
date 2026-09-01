import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

describe('hrrRateLimiter', () => {
  let remaining, msUntilSlotAvailable, recordRequest, tryAcquire, status;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import('../../src/app/utils/hrrRateLimiter');
    remaining = mod.remaining;
    msUntilSlotAvailable = mod.msUntilSlotAvailable;
    recordRequest = mod.recordRequest;
    tryAcquire = mod.tryAcquire;
    status = mod.status;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  describe('remaining', () => {
    it('returns max requests when no requests made', () => {
      expect(remaining()).toBe(9999);
    });

    it('decreases after recording requests', () => {
      recordRequest();
      expect(remaining()).toBe(9998);
    });
  });

  describe('tryAcquire', () => {
    it('returns true and records request when slot available', () => {
      expect(tryAcquire()).toBe(true);
      expect(remaining()).toBe(9998);
    });

    it('returns false when window is full', () => {
      for (let i = 0; i < 9999; i++) {
        recordRequest();
      }
      expect(tryAcquire()).toBe(false);
    });
  });

  describe('msUntilSlotAvailable', () => {
    it('returns 0 when slots are available', () => {
      expect(msUntilSlotAvailable()).toBe(0);
    });

    it('returns positive wait time when window is full', () => {
      for (let i = 0; i < 9999; i++) {
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
      expect(s).toHaveProperty('maxRequests', 9999);
      expect(s).toHaveProperty('windowMs', 24 * 60 * 60 * 1000);
    });
  });
});
