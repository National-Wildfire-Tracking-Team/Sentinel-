// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { fetchLightning } from '../../src/app/api/lightning.js';

const DOC = {
  schemaVersion: 1,
  generatedAt: '2026-10-18T19:00:00Z',
  windowSeconds: 900,
  base: 1792350000,
  sources: {},
  flashes: { lon: [-9750], lat: [3525], t: [10], e: [20] },
};
const BASE = 'https://proj.supabase.co/storage/v1/object/public/lightning';

describe('fetchLightning', () => {
  it('reads the gzipped file from the lightning bucket', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(gzipSync(JSON.stringify(DOC)), {
      headers: { 'Content-Type': 'application/gzip' },
    }));
    const out = await fetchLightning(BASE, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/v1/latest.json.gz`);
    expect(fetchImpl.mock.calls[0][1].cache).toBe('no-cache');
    expect(out.geojson.features[0].geometry.coordinates).toEqual([-97.5, 35.25]);
  });

  it('also accepts plain JSON (a CDN that already decoded it)', async () => {
    const out = await fetchLightning(BASE, { fetchImpl: async () => new Response(JSON.stringify(DOC)) });
    expect(out.geojson.features).toHaveLength(1);
  });

  it('HTTP errors, garbage and network failures become readable errors', async () => {
    await expect(fetchLightning(BASE, { fetchImpl: async () => new Response('', { status: 400 }) })).rejects.toThrow(/HTTP 400/);
    await expect(fetchLightning(BASE, { fetchImpl: async () => new Response('<html>') })).rejects.toThrow(/unexpected format/);
    await expect(fetchLightning(BASE, { fetchImpl: async () => { throw new TypeError('offline'); } })).rejects.toThrow(/unreachable/);
    await expect(fetchLightning(null)).rejects.toThrow(/not configured/);
  });

  it('defaults to the project\'s public lightning bucket', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co/');
    vi.resetModules();
    try {
      const { LIGHTNING_URL } = await import('../../src/app/api/lightning.js');
      expect(LIGHTNING_URL).toBe(BASE);
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.resetModules();
      expect((await import('../../src/app/api/lightning.js')).LIGHTNING_URL).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
