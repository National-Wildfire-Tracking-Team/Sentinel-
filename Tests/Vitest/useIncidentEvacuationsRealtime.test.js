import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = [];
let tableRows = [];

vi.mock('../../src/shared/api/supabaseClient', () => {
  const query = {
    select: () => query,
    in: () => query,
    order: () => query,
    then: (resolve) => resolve({ data: tableRows, error: null }),
  };
  const channel = {
    on: (_type, opts, cb) => { handlers.push({ opts, cb }); return channel; },
    subscribe: () => channel,
  };
  return {
    isSupabaseConfigured: true,
    supabase: { from: () => query, channel: () => channel, removeChannel: () => {} },
  };
});

vi.mock('../../src/shared/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

const { useIncidentEvacuations } = await import('../../src/app/hooks/useIncidentDetails');

const fire = (event, payload) => handlers
  .filter((h) => h.opts.event === event)
  .forEach((h) => h.cb(payload));

describe('useIncidentEvacuations realtime', () => {
  beforeEach(() => {
    handlers.length = 0;
    tableRows = [
      { id: 'r1', incident_id: 'F1', level: 'order', zones: ['KAN-U017'] },
      { id: 'r2', incident_id: 'F1', level: 'warning', zones: ['CRN-U019'] },
    ];
  });

  it('subscribes to deletes without the incident_id filter', () => {
    renderHook(() => useIncidentEvacuations('F1'));
    const del = handlers.find((h) => h.opts.event === 'DELETE');
    expect(del.opts.filter).toBeUndefined();
    expect(handlers.find((h) => h.opts.event === 'INSERT').opts.filter).toBe('incident_id=eq.F1');
  });

  it('drops a lifted level when its row is deleted', async () => {
    const { result } = renderHook(() => useIncidentEvacuations('F1'));
    await waitFor(() => expect(result.current).toHaveLength(2));

    tableRows = tableRows.filter((r) => r.id !== 'r2');
    await act(async () => { fire('DELETE', { old: { id: 'r2' } }); });
    await waitFor(() => expect(result.current.map((r) => r.level)).toEqual(['order']));
  });

  it('ignores deletes of rows from other incidents', async () => {
    const { result } = renderHook(() => useIncidentEvacuations('F1'));
    await waitFor(() => expect(result.current).toHaveLength(2));

    tableRows = [];
    await act(async () => { fire('DELETE', { old: { id: 'other' } }); });
    expect(result.current).toHaveLength(2);
  });

  it('shows a newly added level', async () => {
    const { result } = renderHook(() => useIncidentEvacuations('F1'));
    await waitFor(() => expect(result.current).toHaveLength(2));

    tableRows = [...tableRows, { id: 'r3', incident_id: 'F1', level: 'order', zones: ['SYC-U016-A'] }];
    await act(async () => { fire('INSERT', { new: tableRows[2] }); });
    await waitFor(() => expect(result.current).toHaveLength(3));
  });
});
