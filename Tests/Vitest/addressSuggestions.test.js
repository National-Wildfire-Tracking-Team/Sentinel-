import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../../src/shared/api/supabaseClient', () => ({
  supabase: { functions: { invoke: (...args) => invoke(...args) } },
  isSupabaseConfigured: true,
}));
vi.mock('../../src/app/utils/mapboxRateLimiter', () => ({ acquireSlot: vi.fn().mockResolvedValue(undefined) }));

// Deterministic token for the direct-Mapbox fallback (read at module load).
vi.stubEnv('VITE_MAPBOX_TOKEN', 'test-token');
const { suggestAddresses, geocodeAddress, __clearSuggestionCache } = await import('../../src/app/utils/geocode');

// The shape @supabase/functions-js returns for a non-2xx: FunctionsHttpError with the Response as .context.
const httpError = (status) => Object.assign(new Error('Edge Function returned a non-2xx status code'), {
  name: 'FunctionsHttpError', context: { status },
});

const v6 = (id, name, full, coords) => ({
  type: 'Feature', id, geometry: { type: 'Point', coordinates: coords }, properties: { mapbox_id: id, name, full_address: full },
});

describe('suggestAddresses', () => {
  beforeEach(() => {
    invoke.mockReset();
    __clearSuggestionCache();
    vi.unstubAllGlobals();
  });

  it('makes no call for queries shorter than 3 trimmed chars', async () => {
    expect(await suggestAddresses('  ab  ')).toEqual([]);
    expect(await suggestAddresses('')).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('calls the edge function with autocomplete, limit 5 and US address types', async () => {
    invoke.mockResolvedValue({ data: { features: [] }, error: null });
    await suggestAddresses('1 Main', { proximity: [-121, 38] });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe('mapbox-geocoding');
    expect(opts.body).toMatchObject({
      query: '1 Main', autocomplete: true, limit: 5, country: 'us',
      types: 'address,place,postcode,neighborhood,locality,poi',
    });
    expect(opts.body.proximity).toEqual([-121, 38]);
  });

  it('omits invalid proximity from the edge body', async () => {
    invoke.mockResolvedValue({ data: { features: [] }, error: null });
    await suggestAddresses('1 Main', { proximity: [-500, 38] });
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty('proximity');
  });

  it('caches: the same query twice makes one network call (case and spaces ignored)', async () => {
    invoke.mockResolvedValue({ data: { features: [v6('a', '1 Main St', '1 Main St, Sacramento, CA', [-121.5, 38.5])] }, error: null });
    const first = await suggestAddresses('1 Main', { proximity: [-121.001, 38.001] });
    const second = await suggestAddresses('  1 MAIN ', { proximity: [-121.004, 38.002] });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('a different proximity cell misses the cache', async () => {
    invoke.mockResolvedValue({ data: { features: [] }, error: null });
    await suggestAddresses('1 Main', { proximity: [-121, 38] });
    await suggestAddresses('1 Main', { proximity: [-121.5, 38] });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('cache entries expire after 5 minutes', async () => {
    vi.useFakeTimers();
    try {
      invoke.mockResolvedValue({ data: { features: [] }, error: null });
      await suggestAddresses('1 Main');
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await suggestAddresses('1 Main');
      expect(invoke).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a 429 from the edge returns [] without falling back to Mapbox, and is not cached', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    invoke.mockResolvedValue({ data: null, error: httpError(429) });
    expect(await suggestAddresses('1 Main')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    await suggestAddresses('1 Main');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('a non-429 edge error still falls back to direct Mapbox', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });
    vi.stubGlobal('fetch', fetchSpy);
    invoke.mockResolvedValue({ data: null, error: httpError(500) });
    await suggestAddresses('1 Main', { proximity: [-121, 38] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain('autocomplete=true');
    expect(url).toContain('proximity=-121%2C38');
  });

  it('geocodeAddress does not fall back to Mapbox on a 429', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    invoke.mockResolvedValue({ data: null, error: httpError(429) });
    await expect(geocodeAddress('1 Main St')).rejects.toThrow(/rate limit/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps features to { id, label, lat, lng }', async () => {
    invoke.mockResolvedValue({
      data: { features: [v6('a', '1 Main St', '1 Main St, Sacramento, CA', [-121.5, 38.5]), v6('b', 'Mainville', null, [-120, 37])] },
      error: null,
    });
    expect(await suggestAddresses('1 Main')).toEqual([
      { id: 'a', label: '1 Main St, Sacramento, CA', lat: 38.5, lng: -121.5 },
      { id: 'b', label: 'Mainville', lat: 37, lng: -120 },
    ]);
  });

  it('drops features without coordinates', async () => {
    invoke.mockResolvedValue({ data: { features: [{ id: 'x', properties: { name: 'X' } }] }, error: null });
    expect(await suggestAddresses('xyz')).toEqual([]);
  });

  it('propagates AbortError', async () => {
    const ctrl = new AbortController();
    invoke.mockImplementation(async () => { ctrl.abort(); return { data: null, error: new Error('fetch failed') }; });
    await expect(suggestAddresses('1 Main', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects with AbortError when already aborted, without a call', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(suggestAddresses('1 Main', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).not.toHaveBeenCalled();
  });
});
