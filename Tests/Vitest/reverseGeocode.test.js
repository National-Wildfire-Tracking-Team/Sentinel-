// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/shared/api/supabaseClient', () => ({ supabase: {}, isSupabaseConfigured: false }));
vi.mock('../../src/app/utils/mapboxRateLimiter', () => ({ acquireSlot: vi.fn().mockResolvedValue(undefined) }));

describe('reverseGeocode', () => {
  let reverseGeocode;
  let clear;
  beforeEach(async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test');
    vi.resetModules();
    ({ reverseGeocode, __clearReverseCache: clear } = await import('../../src/app/utils/geocode.js'));
    clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns the first place name and caches by ~10 m cell', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [{ place_name: '1 Main St, Sacramento, CA' }] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(reverseGeocode([-121.49441, 38.58161])).resolves.toBe('1 Main St, Sacramento, CA');
    await expect(reverseGeocode([-121.49442, 38.58162])).resolves.toBe('1 Main St, Sacramento, CA');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/mapbox.places/-121.49441,38.58161.json');
  });

  it('returns null on no match, a failed response, or bad coordinates', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ features: [] })))
      .mockResolvedValueOnce(new Response('x', { status: 500 })));
    await expect(reverseGeocode([-120, 38])).resolves.toBeNull();
    await expect(reverseGeocode([-119, 37])).resolves.toBeNull();
    await expect(reverseGeocode([NaN, 37])).resolves.toBeNull();
  });
});
