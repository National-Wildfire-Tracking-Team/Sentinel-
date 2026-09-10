import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Sentinel's own Supabase wrapper directly (not the raw @supabase/supabase-js
// package, which is already mocked globally in src/test/mocks/modules.js for
// other tests) — this intercepts at the exact layer mrmsComposite.js uses,
// without touching or depending on that shared mock's chain shape.
const mockLimit = vi.fn();
const mockOrder = vi.fn(() => ({ limit: mockLimit }));
const mockEq = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('../../src/shared/api/supabaseClient', () => ({
  supabase: { from: mockFrom },
  isSupabaseConfigured: true,
}));

const { fetchMrmsHistory } = await import('../../src/app/api/mrmsComposite');

describe('fetchMrmsHistory (Phase 6A 100-frame window)', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockSelect.mockClear();
    mockEq.mockClear();
    mockOrder.mockClear();
    mockLimit.mockClear();
  });

  it('queries mrms_radar_archive DESC + LIMIT 100, then returns ascending order', async () => {
    mockLimit.mockResolvedValueOnce({
      data: [
        { sourceTime: '2026-09-10T14:10:40+00:00', storagePath: 'a' },
        { sourceTime: '2026-09-10T13:54:42+00:00', storagePath: 'b' },
        { sourceTime: '2026-09-10T13:16:39+00:00', storagePath: 'c' },
      ],
      error: null,
    });

    const result = await fetchMrmsHistory();

    expect(mockFrom).toHaveBeenCalledWith('mrms_radar_archive');
    expect(mockSelect).toHaveBeenCalledWith('sourceTime:source_time, storagePath:storage_path');
    expect(mockOrder).toHaveBeenCalledWith('source_time', { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(100);

    // The archive is queried newest-first (for a cheap indexed LIMIT), but
    // every consumer (useRadarHistory, RadarTimeline) expects oldest-first.
    expect(result.map((r) => r.sourceTime)).toEqual([
      '2026-09-10T13:16:39+00:00',
      '2026-09-10T13:54:42+00:00',
      '2026-09-10T14:10:40+00:00',
    ]);
  });

  it('returns an empty array when there is no data yet', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchMrmsHistory()).toEqual([]);
  });

  it('throws when Supabase reports an error', async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    await expect(fetchMrmsHistory()).rejects.toThrow('boom');
  });
});
