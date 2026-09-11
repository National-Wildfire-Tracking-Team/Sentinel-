import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gzipSync } from 'node:zlib';

// Mock Sentinel's own Supabase wrapper directly, at the exact layer
// nexradScans.js uses (mirrors the pattern in mrmsComposite.test.js).
const mockGetPublicUrl = vi.fn((path) => ({
  data: { publicUrl: `https://cdn.example.com/nexrad-scans/${path}` },
}));
const mockStorageFrom = vi.fn(() => ({ getPublicUrl: mockGetPublicUrl }));

vi.mock('../../src/shared/api/supabaseClient', () => ({
  supabase: { storage: { from: mockStorageFrom } },
  isSupabaseConfigured: true,
}));

const { fetchScanPayload } = await import('../../src/app/api/nexradScans');

function fakeCompressedPayload() {
  // Real gzip bytes so gunzip() succeeds; decodeScanPayload will throw on
  // the (deliberately minimal) decompressed content, which is fine — these
  // tests only assert on the URL fetch() was called with, not the decode.
  return gzipSync(Buffer.from('not a real NEXRAD payload'));
}

describe('fetchScanPayload — historical vs live fetch URLs', () => {
  beforeEach(() => {
    mockStorageFrom.mockClear();
    mockGetPublicUrl.mockClear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fakeCompressedPayload().buffer,
    });
  });

  it('fetches a stable URL (no cache-busting) for an immutable historical scan', async () => {
    await fetchScanPayload('KTLX/reflectivity/history/2026-09-10T14:00:00.000Z.bin', { immutable: true })
      .catch(() => {}); // decode of the fake payload is expected to fail; only the fetch URL matters here

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = global.fetch.mock.calls[0];
    expect(calledUrl).toBe('https://cdn.example.com/nexrad-scans/KTLX/reflectivity/history/2026-09-10T14:00:00.000Z.bin');
    expect(calledUrl).not.toContain('?t=');
  });

  it('appends a cache-busting query param for the live/latest path (default, no options)', async () => {
    await fetchScanPayload('KTLX/reflectivity/latest.bin').catch(() => {});

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = global.fetch.mock.calls[0];
    expect(calledUrl).toMatch(/^https:\/\/cdn\.example\.com\/nexrad-scans\/KTLX\/reflectivity\/latest\.bin\?t=\d+$/);
  });

  it('appends a cache-busting query param when immutable is explicitly false', async () => {
    await fetchScanPayload('KTLX/reflectivity/latest.bin', { immutable: false }).catch(() => {});

    const [calledUrl] = global.fetch.mock.calls[0];
    expect(calledUrl).toContain('?t=');
  });

  it('requests two different immutable historical scans at two different stable URLs', async () => {
    await fetchScanPayload('KTLX/reflectivity/history/a.bin', { immutable: true }).catch(() => {});
    await fetchScanPayload('KTLX/reflectivity/history/b.bin', { immutable: true }).catch(() => {});

    const [urlA] = global.fetch.mock.calls[0];
    const [urlB] = global.fetch.mock.calls[1];
    expect(urlA).not.toBe(urlB);
    expect(urlA).not.toContain('?t=');
    expect(urlB).not.toContain('?t=');
  });
});
