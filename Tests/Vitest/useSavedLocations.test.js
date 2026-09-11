import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavedLocations } from '../../src/app/hooks/useSavedLocations';
import { useAuth } from '../../src/shared/context/AuthContext';
import { usePlan } from '../../src/shared/hooks/usePlan';
import { supabase } from '../../src/shared/api/supabaseClient';

vi.mock('../../src/shared/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../src/shared/hooks/usePlan', () => ({ usePlan: vi.fn() }));
vi.mock('../../src/shared/api/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: vi.fn(),
    getChannels: vi.fn(() => []),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));
vi.mock('../../src/app/api/noaaWeather', () => ({ fetchAlertsByPoint: vi.fn() }));

describe('useSavedLocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { id: 'user-1' },
      isAuthenticated: true,
    });
    usePlan.mockReturnValue({
      plan: { savedLocationsLimit: 4 },
    });

    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: `location-${index}`,
      created_at: `2026-09-0${index + 1}T00:00:00Z`,
    }));
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    supabase.from.mockReturnValue({
      select: vi.fn(() => ({ order })),
    });

    const channel = {
      on: vi.fn(),
      subscribe: vi.fn(),
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    supabase.channel.mockReturnValue(channel);
  });

  it('keeps downgraded locations visible and reports the over-limit state', async () => {
    const { result } = renderHook(() => useSavedLocations());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.locations).toHaveLength(5);
    expect(result.current.overLimit).toBe(true);
    expect(result.current.atLimit).toBe(true);
  });
});
