import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavedLocations, FREE_LOCATION_LIMIT } from '../../src/app/hooks/useSavedLocations';
import { useAuth } from '../../src/shared/context/AuthContext';
import { usePlan, PLANS } from '../../src/shared/hooks/usePlan';
import { supabase } from '../../src/shared/api/supabaseClient';

vi.mock('../../src/shared/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../src/shared/hooks/usePlan', async (importOriginal) => ({
  ...(await importOriginal()),
  usePlan: vi.fn(),
}));
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

const VALID = { name: 'Home', address: 'Boise, ID 83702', latitude: 43.6, longitude: -116.2 };

/** Minimal chainable stand-in for supabase.from('saved_locations'). */
function mockTable(rows) {
  const calls = { insert: [], update: [], delete: [] };
  const table = {
    select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: rows, error: null }) })),
    insert: vi.fn((row) => {
      calls.insert.push(row);
      return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new', ...row }, error: null }) }) };
    }),
    update: vi.fn((changes) => {
      calls.update.push(changes);
      return {
        eq: (_col, id) => ({
          select: () => ({ single: () => Promise.resolve({ data: { ...rows.find((r) => r.id === id), ...changes }, error: null }) }),
        }),
      };
    }),
    delete: vi.fn(() => ({
      eq: (_col, id) => { calls.delete.push(id); return Promise.resolve({ error: null }); },
    })),
  };
  supabase.from.mockReturnValue(table);
  return { table, calls };
}

const makeRows = (n) => Array.from({ length: n }, (_, index) => ({
  id: `location-${index}`,
  name: `Loc ${index}`,
  created_at: `2026-09-0${index + 1}T00:00:00Z`,
}));

describe('useSavedLocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 'user-1' }, isAuthenticated: true });
    usePlan.mockReturnValue({ plan: PLANS.free });

    const channel = { on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    supabase.channel.mockReturnValue(channel);
  });

  it('takes the free limit from the plan configuration', () => {
    expect(FREE_LOCATION_LIMIT).toBe(PLANS.free.savedLocationsLimit);
    expect(FREE_LOCATION_LIMIT).toBe(4);
  });

  it('keeps downgraded locations visible and reports the over-limit state', async () => {
    mockTable(makeRows(5));
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.locations).toHaveLength(5));
    expect(result.current.overLimit).toBe(true);
    expect(result.current.atLimit).toBe(true);
  });

  it('creates a location with name, radius, and notification switch', async () => {
    const { calls } = mockTable([]);
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.addLocation({ ...VALID, name: '  Home  ', notifyRadiusMiles: 50, alertsEnabled: false }));

    expect(calls.insert[0]).toMatchObject({
      user_id: 'user-1', name: 'Home', latitude: 43.6, longitude: -116.2,
      notify_radius_miles: 50, alerts_enabled: false, notify_new_fires: true,
    });
    expect(result.current.locations).toHaveLength(1);
  });

  it('defaults the radius to 25 miles and notifications on', async () => {
    const { calls } = mockTable([]);
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.addLocation(VALID));
    expect(calls.insert[0]).toMatchObject({ notify_radius_miles: 25, alerts_enabled: true });
  });

  it('refuses to add past the plan limit without calling the database', async () => {
    const { table } = mockTable(makeRows(4));
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.locations).toHaveLength(4));
    await expect(result.current.addLocation(VALID)).rejects.toThrow(/up to 4 saved locations/);
    expect(table.insert).not.toHaveBeenCalled();
  });

  it('surfaces the database limit error when the client count is stale', async () => {
    const { table } = mockTable([]);
    table.insert.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'Your plan allows up to 4 saved locations.', code: '23514' } }) }),
    });
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.addLocation(VALID)).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects invalid coordinates, empty names, and bad radii before saving', async () => {
    const { table } = mockTable([]);
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.addLocation({ ...VALID, latitude: 200 })).rejects.toThrow(/coordinates/);
    await expect(result.current.addLocation({ ...VALID, name: ' ' })).rejects.toThrow(/name/);
    await expect(result.current.addLocation({ ...VALID, notifyRadiusMiles: 0 })).rejects.toThrow(/radius/i);
    expect(table.insert).not.toHaveBeenCalled();
  });

  it('updates name, radius, and notification switch, and persists the result', async () => {
    const { calls } = mockTable(makeRows(1));
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.locations).toHaveLength(1));

    await act(() => result.current.updateLocation('location-0', {
      name: ' Cabin ', notify_radius_miles: 10, alerts_enabled: false,
    }));

    expect(calls.update[0]).toEqual({ name: 'Cabin', notify_radius_miles: 10, alerts_enabled: false });
    expect(result.current.locations[0]).toMatchObject({ name: 'Cabin', notify_radius_miles: 10, alerts_enabled: false });
  });

  it('never sends ownership or timestamp columns in an update', async () => {
    const { calls } = mockTable(makeRows(1));
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.locations).toHaveLength(1));
    await act(() => result.current.updateLocation('location-0', {
      user_id: 'someone-else', id: 'x', created_at: 'y', updated_at: 'z', alerts_enabled: true,
    }));
    expect(calls.update[0]).toEqual({ alerts_enabled: true });
  });

  it('rejects an invalid radius on update', async () => {
    const { table } = mockTable(makeRows(1));
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.locations).toHaveLength(1));
    await expect(result.current.updateLocation('location-0', { notify_radius_miles: 1000 })).rejects.toThrow(/radius/i);
    expect(table.update).not.toHaveBeenCalled();
  });

  it('deletes a location', async () => {
    const { calls } = mockTable(makeRows(2));
    const { result } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.locations).toHaveLength(2));
    await act(() => result.current.removeLocation('location-0'));
    expect(calls.delete).toEqual(['location-0']);
    expect(result.current.locations.map((l) => l.id)).toEqual(['location-1']);
  });

  it('reloads saved locations from the database on mount (persistence across sessions)', async () => {
    const { table } = mockTable(makeRows(3));
    const { result, unmount } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(result.current.locations).toHaveLength(3));
    unmount();
    const { result: again } = renderHook(() => useSavedLocations());
    await waitFor(() => expect(again.current.locations).toHaveLength(3));
    expect(table.select).toHaveBeenCalledTimes(2);
  });
});
