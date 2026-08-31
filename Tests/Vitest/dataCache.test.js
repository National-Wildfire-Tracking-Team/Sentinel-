import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCached,
  setCached,
  invalidateCache,
  clearCache,
  fetchWithCache,
} from '../../src/app/utils/dataCache';

describe('dataCache', () => {
  beforeEach(() => {
    clearCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getCached / setCached', () => {
    it('returns null on cache miss', () => {
      expect(getCached('missing')).toBeNull();
    });

    it('stores and retrieves data', () => {
      setCached('key1', { foo: 'bar' });
      expect(getCached('key1')).toEqual({ foo: 'bar' });
    });

    it('returns null after TTL expires', () => {
      setCached('key1', 'data', 1000);
      expect(getCached('key1')).toBe('data');

      vi.advanceTimersByTime(1001);
      expect(getCached('key1')).toBeNull();
    });

    it('uses default TTL of 5 minutes', () => {
      setCached('key1', 'data');
      vi.advanceTimersByTime(5 * 60 * 1000 - 100);
      expect(getCached('key1')).toBe('data');

      vi.advanceTimersByTime(200);
      expect(getCached('key1')).toBeNull();
    });
  });

  describe('invalidateCache', () => {
    it('removes a specific cache entry', () => {
      setCached('key1', 'data1');
      setCached('key2', 'data2');
      invalidateCache('key1');
      expect(getCached('key1')).toBeNull();
      expect(getCached('key2')).toBe('data2');
    });
  });

  describe('clearCache', () => {
    it('removes all cache entries', () => {
      setCached('key1', 'data1');
      setCached('key2', 'data2');
      clearCache();
      expect(getCached('key1')).toBeNull();
      expect(getCached('key2')).toBeNull();
    });
  });
});

describe('fetchWithCache', () => {
  beforeEach(() => {
    clearCache();
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches and caches data', async () => {
    const mockData = { results: [1, 2, 3] };
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await fetchWithCache('https://api.example.com/data', 'cacheKey');
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const result2 = await fetchWithCache('https://api.example.com/data', 'cacheKey');
    expect(result2).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws on non-OK response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(
      fetchWithCache('https://api.example.com/data', 'cacheKey')
    ).rejects.toThrow('HTTP 500: Internal Server Error');
  });

  it('throws on invalid JSON', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Unexpected token')),
    });

    await expect(
      fetchWithCache('https://api.example.com/data', 'cacheKey')
    ).rejects.toThrow('Invalid JSON response');
  });

  it('re-fetches after TTL expires', async () => {
    const mockData = { results: [1] };
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    await fetchWithCache('https://api.example.com/data', 'cacheKey', {}, 1000);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);

    await fetchWithCache('https://api.example.com/data', 'cacheKey', {}, 1000);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
