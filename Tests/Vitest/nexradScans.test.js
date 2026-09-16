import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gzipSync } from 'node:zlib';

vi.stubEnv('VITE_NEXRAD_SCANS_BUCKET', 'test-bucket');
vi.stubEnv('VITE_NEXRAD_HEARTBEAT_URL', 'https://heartbeat.example.com');

// A fake Firestore Timestamp shaped just like the real @google-cloud/firestore
// / firebase/firestore one — only the one method nexradScans.js actually calls.
function fakeTimestamp(iso) {
  return { toDate: () => new Date(iso) };
}

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ __collection: name })),
  doc: vi.fn((_db, name, id) => ({ __doc: `${name}/${id}` })),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: vi.fn((...args) => args),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  Timestamp: { fromDate: (d) => fakeTimestamp(d.toISOString()) },
}));

vi.mock('../../src/shared/api/firebaseClient', () => ({
  db: {},
  isFirebaseConfigured: true,
  getAnonymousIdToken: vi.fn().mockResolvedValue('fake-id-token'),
}));

const {
  fetchScanPayload, fetchScanMeta, fetchAllLatestReflectivity, fetchAllReflectivityHistory, sendRadarHeartbeat,
} = await import('../../src/app/api/nexradScans');

function fakeCompressedPayload() {
  // Real gzip bytes so gunzip() succeeds; decodeScanPayload will throw on
  // the (deliberately minimal) decompressed content, which is fine — these
  // tests only assert on the URL fetch() was called with, not the decode.
  return gzipSync(Buffer.from('not a real NEXRAD payload'));
}

describe('fetchScanPayload — historical vs live fetch URLs', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fakeCompressedPayload().buffer,
    });
  });

  it('fetches a stable URL (no cache-busting) for an immutable historical scan', async () => {
    await fetchScanPayload('KTLX/reflectivity/history/2026-09-10T14-00-00-000Z.bin', { immutable: true })
      .catch(() => {}); // decode of the fake payload is expected to fail; only the fetch URL matters here

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = global.fetch.mock.calls[0];
    expect(calledUrl).toBe('https://storage.googleapis.com/test-bucket/KTLX/reflectivity/history/2026-09-10T14-00-00-000Z.bin');
    expect(calledUrl).not.toContain('?t=');
  });

  it('appends a cache-busting query param for the live/latest path (default, no options)', async () => {
    await fetchScanPayload('KTLX/reflectivity/latest.bin').catch(() => {});

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = global.fetch.mock.calls[0];
    expect(calledUrl).toMatch(/^https:\/\/storage\.googleapis\.com\/test-bucket\/KTLX\/reflectivity\/latest\.bin\?t=\d+$/);
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

describe('Firestore Timestamp -> ISO string conversion', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
  });

  it('fetchScanMeta converts scan_time/updated_at Timestamps to ISO strings', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        site_id: 'KTLX', product: 'reflectivity',
        scan_time: fakeTimestamp('2026-09-15T20:00:00.000Z'),
        updated_at: fakeTimestamp('2026-09-15T20:01:00.000Z'),
        storage_path: 'KTLX/reflectivity/latest.bin',
      }),
    });

    const meta = await fetchScanMeta('KTLX', 'reflectivity');
    expect(meta.scan_time).toBe('2026-09-15T20:00:00.000Z');
    expect(meta.updated_at).toBe('2026-09-15T20:01:00.000Z');
  });

  it('fetchScanMeta returns null when no doc exists', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    expect(await fetchScanMeta('KTLX', 'reflectivity')).toBeNull();
  });

  it('fetchAllLatestReflectivity maps every doc\'s scan_time to an ISO string', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { data: () => ({ site_id: 'KTLX', scan_time: fakeTimestamp('2026-09-15T20:00:00.000Z'), storage_path: 'a.bin' }) },
        { data: () => ({ site_id: 'KMLB', scan_time: fakeTimestamp('2026-09-15T20:05:00.000Z'), storage_path: 'b.bin' }) },
      ],
    });

    const rows = await fetchAllLatestReflectivity();
    expect(rows).toEqual([
      { site_id: 'KTLX', scan_time: '2026-09-15T20:00:00.000Z', storage_path: 'a.bin' },
      { site_id: 'KMLB', scan_time: '2026-09-15T20:05:00.000Z', storage_path: 'b.bin' },
    ]);
  });

  it('fetchAllReflectivityHistory maps every doc\'s scan_time to an ISO string', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { data: () => ({ site_id: 'KTLX', scan_time: fakeTimestamp('2026-09-15T19:00:00.000Z'), storage_path: 'h1.bin' }) },
      ],
    });

    const rows = await fetchAllReflectivityHistory();
    expect(rows).toEqual([{ site_id: 'KTLX', scan_time: '2026-09-15T19:00:00.000Z', storage_path: 'h1.bin' }]);
  });
});

describe('sendRadarHeartbeat', () => {
  it('POSTs to the heartbeat service with a bearer token', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    await sendRadarHeartbeat('KTLX');

    expect(global.fetch).toHaveBeenCalledWith('https://heartbeat.example.com', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer fake-id-token' }),
      body: JSON.stringify({ site_id: 'KTLX' }),
    }));
  });

  it('never throws even if the network call fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(sendRadarHeartbeat('KTLX')).resolves.toBeUndefined();
  });
});
