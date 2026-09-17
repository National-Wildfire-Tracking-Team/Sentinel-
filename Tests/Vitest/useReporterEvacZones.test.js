import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useReporterEvacZones } from '../../src/app/hooks/useReporterEvacZones';
import { supabase } from '../../src/shared/api/supabaseClient';

vi.mock('../../src/shared/api/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

// The real error PostgREST returns for a table that isn't in its schema
// cache — confirmed live against production: {"code":"PGRST205","message":
// "Could not find the table 'public.reporter_evac_zones' in the schema
// cache"}. PGRST116 (what the code used to check for) means something
// unrelated, and PostgrestError has no `.status` field at all.
const MISSING_TABLE_ERROR = {
  code: 'PGRST205',
  message: "Could not find the table 'public.reporter_evac_zones' in the schema cache",
};

describe('useReporterEvacZones — missing-table detection', () => {
  it('recognizes a PGRST205 "not in schema cache" error and stops after the existence check, without also firing the full query', async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: MISSING_TABLE_ERROR });
    const order = vi.fn(); // should never be called — that's the full-query path
    supabase.from.mockReturnValue({
      select: vi.fn(() => ({ limit, order })),
    });
    supabase.channel.mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() });

    const { result } = renderHook(() => useReporterEvacZones('active', true));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.zones).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(limit).toHaveBeenCalledTimes(1);
    expect(order).not.toHaveBeenCalled();
  });
});
