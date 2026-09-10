import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNexradScan } from '../../src/app/hooks/useNexradScan';
import * as nexradScans from '../../src/app/api/nexradScans';

vi.mock('../../src/app/api/nexradScans');

beforeEach(() => {
  vi.clearAllMocks();
  nexradScans.sendRadarHeartbeat.mockResolvedValue(undefined);
});

/** Identity-distinguishable stand-in for a decoded payload, tagged by storage path. */
function payloadFor(tag) {
  return { tag };
}

describe('useNexradScan — live mode', () => {
  it('fetches meta and payload for the live scan', async () => {
    nexradScans.fetchScanMeta.mockResolvedValue({
      scan_time: '2026-09-10T15:00:00Z',
      storage_path: 'KTLX/reflectivity/latest.bin',
      updated_at: new Date().toISOString(),
    });
    nexradScans.fetchScanPayload.mockResolvedValue(payloadFor('a'));

    const { result } = renderHook(() => useNexradScan('KTLX', 'reflectivity', true, 0));

    await waitFor(() => expect(result.current.status).toBe('live'));
    expect(result.current.payload).toEqual(payloadFor('a'));
    expect(nexradScans.fetchScanPayload).toHaveBeenCalledTimes(1);
  });

  it('surfaces a concise, generic error — never the raw exception message', async () => {
    nexradScans.fetchScanMeta.mockRejectedValue(
      new Error('relation "public.nexrad_scan_meta" does not exist'),
    );

    const { result } = renderHook(() => useNexradScan('KTLX', 'reflectivity', true, 0));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe('Radar data is temporarily unavailable.');
    expect(result.current.error).not.toMatch(/relation|nexrad_scan_meta|postgres/i);
  });
});

describe('useNexradScan — historical mode + bounded cache', () => {
  const rows = [
    { scan_time: '2026-09-10T14:00:00.000Z', storage_path: 'KTLX/reflectivity/history/a.bin' },
    { scan_time: '2026-09-10T14:10:00.000Z', storage_path: 'KTLX/reflectivity/history/b.bin' },
    { scan_time: '2026-09-10T14:20:00.000Z', storage_path: 'KTLX/reflectivity/history/c.bin' },
  ];

  function minutesAgoFor(row) {
    return Math.round((Date.now() - new Date(row.scan_time).getTime()) / 60000);
  }

  it('does not re-fetch a previously-decoded scan when scrubbing back to it', async () => {
    nexradScans.fetchScanHistory.mockResolvedValue(rows);
    nexradScans.fetchScanPayload.mockImplementation((path) => Promise.resolve(payloadFor(path)));

    const { result, rerender } = renderHook(
      ({ minutesAgo }) => useNexradScan('KTLX', 'reflectivity', true, minutesAgo),
      { initialProps: { minutesAgo: minutesAgoFor(rows[0]) } },
    );

    await waitFor(() => expect(result.current.payload).toEqual(payloadFor(rows[0].storage_path)));
    expect(nexradScans.fetchScanPayload).toHaveBeenCalledTimes(1);

    rerender({ minutesAgo: minutesAgoFor(rows[1]) });
    await waitFor(() => expect(result.current.payload).toEqual(payloadFor(rows[1].storage_path)));
    expect(nexradScans.fetchScanPayload).toHaveBeenCalledTimes(2);

    // Scrub back to the first scan — a single-slot "last decoded" guard would
    // have missed this (it only remembers the most recent one); the bounded
    // cache should serve it without a third fetch.
    rerender({ minutesAgo: minutesAgoFor(rows[0]) });
    await waitFor(() => expect(result.current.payload).toEqual(payloadFor(rows[0].storage_path)));
    expect(nexradScans.fetchScanPayload).toHaveBeenCalledTimes(2);
  });

  it('reports no-history (not an error) when the site has no scans in the window yet', async () => {
    nexradScans.fetchScanHistory.mockResolvedValue([]);
    const { result } = renderHook(() => useNexradScan('KTLX', 'reflectivity', true, 30));
    await waitFor(() => expect(result.current.status).toBe('no-history'));
    expect(result.current.error).toBeNull();
  });

  it('surfaces a generic error for a failed history fetch', async () => {
    nexradScans.fetchScanHistory.mockRejectedValue(new Error('PGRST205: schema cache miss'));
    const { result } = renderHook(() => useNexradScan('KTLX', 'reflectivity', true, 30));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe('Radar history is temporarily unavailable.');
  });
});

describe('useNexradScan — site/product cache isolation', () => {
  it('never serves one site+product\'s cached payload for another, even with an identical scan_time', async () => {
    nexradScans.fetchScanMeta.mockImplementation((siteId, product) =>
      Promise.resolve({
        scan_time: '2026-09-10T15:00:00Z', // deliberately identical across all four
        storage_path: `${siteId}/${product}/latest.bin`,
        updated_at: new Date().toISOString(),
      }));
    nexradScans.fetchScanPayload.mockImplementation((path) => Promise.resolve(payloadFor(path)));

    const siteAReflectivity = renderHook(() => useNexradScan('KTLX', 'reflectivity', true, 0));
    const siteAVelocity = renderHook(() => useNexradScan('KTLX', 'velocity', true, 0));
    const siteBReflectivity = renderHook(() => useNexradScan('KOKX', 'reflectivity', true, 0));

    await waitFor(() => expect(siteAReflectivity.result.current.payload).toEqual(payloadFor('KTLX/reflectivity/latest.bin')));
    await waitFor(() => expect(siteAVelocity.result.current.payload).toEqual(payloadFor('KTLX/velocity/latest.bin')));
    await waitFor(() => expect(siteBReflectivity.result.current.payload).toEqual(payloadFor('KOKX/reflectivity/latest.bin')));

    // Three genuinely distinct payloads despite the identical scan_time.
    expect(siteAReflectivity.result.current.payload).not.toEqual(siteAVelocity.result.current.payload);
    expect(siteAReflectivity.result.current.payload).not.toEqual(siteBReflectivity.result.current.payload);
  });
});
