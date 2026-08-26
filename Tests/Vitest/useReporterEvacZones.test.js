import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useReporterEvacZones,
  resetReporterEvacZonesAvailability,
} from '../../src/hooks/useReporterEvacZones';

const { supabaseMock, mockChain } = vi.hoisted(() => {
  const mockChain = () => {
    const c = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then(resolve) { resolve({ data: [], error: null }); },
    };
    return c;
  };
  return {
    mockChain,
    supabaseMock: {
      from: vi.fn(() => mockChain()),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnValue({}),
      })),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('../../src/api/supabaseClient', () => ({
  supabase: supabaseMock,
  isSupabaseConfigured: true,
}));

describe('useReporterEvacZones availability latch', () => {
  beforeEach(() => {
    resetReporterEvacZonesAvailability();
    supabaseMock.from.mockReset();
  });

  it('does not permanently disable the table when the existence check throws', async () => {
    supabaseMock.from
      .mockImplementationOnce(() => {
        throw new Error('network down');
      })
      .mockImplementation(() => {
        const c = mockChain();
        c.eq.mockResolvedValue({
          data: [{ id: 'z1', status: 'active', geometry: { type: 'Polygon' } }],
          error: null,
        });
        return c;
      });

    const { result } = renderHook(() => useReporterEvacZones('active'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.zones).toHaveLength(1);
    expect(result.current.zones[0].id).toBe('z1');
  });
});
