import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRecentUpdates } from './useRecentUpdates';

const mockUpdates = [
  { id: '1', incident_id: 'fire-1', incident_name: 'Test Fire', content: '1000 acres', created_at: '2025-01-01' },
];

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnValue({}),
};

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: mockUpdates, error: null }),
  })),
  channel: vi.fn(() => mockChannel),
  removeChannel: vi.fn(),
};

vi.mock('../api/supabaseClient', () => ({
  get supabase() { return mockSupabase; },
  get isSupabaseConfigured() { return true; },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  mockSupabase.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: mockUpdates, error: null }),
  });
  mockChannel.on.mockClear();
  mockChannel.subscribe.mockClear();
  mockSupabase.removeChannel.mockClear();
});

describe('useRecentUpdates', () => {
  it('fetches recent updates on mount', async () => {
    const { result } = renderHook(() => useRecentUpdates());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.updates).toEqual(mockUpdates);
    expect(mockSupabase.from).toHaveBeenCalledWith('incident_updates');
  });

  it('handles null data from Supabase', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const { result } = renderHook(() => useRecentUpdates());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.updates).toEqual([]);
  });

  it('subscribes to realtime inserts', async () => {
    renderHook(() => useRecentUpdates());

    await waitFor(() => expect(mockChannel.subscribe).toHaveBeenCalled());
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'incident_updates' },
      expect.any(Function)
    );
  });

  it('cleans up channel on unmount', async () => {
    const { unmount } = renderHook(() => useRecentUpdates());

    await waitFor(() => expect(mockChannel.subscribe).toHaveBeenCalled());

    unmount();

    expect(mockSupabase.removeChannel).toHaveBeenCalled();
  });
});
