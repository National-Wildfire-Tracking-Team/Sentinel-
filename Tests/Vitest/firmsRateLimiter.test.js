import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

describe('firmsRateLimiter', () => {
  let remaining, msUntilSlotAvailable, recordRequest, acquireSlot, status;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import('../../src/app/utils/firmsRateLimiter');
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
      expect(remaining()).toBe(4999);
    });

    it('decreases remaining after recording requests', () => {
      recordRequest();
      recordRequest();
      expect(remaining()).toBe(4997);
    });
  });

  describe('msUntilSlotAvailable', () => {
    it('returns 0 when slots are available', () => {
      expect(msUntilSlotAvailable()).toBe(0);
    });

    it('returns positive wait time when window is full', () => {
      for (let i = 0; i < 4999; i++) {
        recordRequest();
      }
      expect(msUntilSlotAvailable()).toBeGreaterThan(0);
    });
  });

  describe('acquireSlot', () => {
    it('resolves immediately when slots are available', async () => {
      const start = Date.now();
      await acquireSlot();
      expect(Date.now()).toBe(start);
    });

    it('waits when window is full', async () => {
      for (let i = 0; i < 4999; i++) {
        recordRequest();
      }

      let resolved = false;
      const promise = acquireSlot().then(() => { resolved = true; });

      expect(resolved).toBe(false);

      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      await promise;
      expect(resolved).toBe(true);
    });
  });

  describe('status', () => {
    it('returns status object with correct fields', () => {
      const s = status();
      expect(s).toHaveProperty('used');
      expect(s).toHaveProperty('remaining');
      expect(s).toHaveProperty('maxRequests', 4999);
      expect(s).toHaveProperty('windowMs', 10 * 60 * 1000);
    });
  });
});
