/**
 * Per-incident Supabase data for the incident sheet, ported from the web's
 * src/app/hooks/useIncidentDetails.js and useIncidentUpdates.js: evacuation levels, shelters, the
 * live update timeline (realtime) and the signed-in user's follow state. Every reader queries the
 * fire's primary id plus its aliases; a missing table reads as "no data".
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { idsFromKey, incidentIdRealtimeFilter, incidentIdsKey } from '@/data/incidentAliases';
import type { EvacuationRow, IncidentUpdate, ShelterRow } from '@/data/incidentDetailModel';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type OrderBy = [column: string, ascending: boolean][];

function useIncidentRows<T extends { id: string }>(
  table: string,
  incidentId: string,
  aliasIds: string[],
  orderBy: OrderBy,
): T[] {
  const idsKey = incidentIdsKey(incidentId, aliasIds);
  const [state, setState] = useState<{ key: string | null; rows: T[] }>({ key: null, rows: [] });
  const shownIds = useRef(new Set<string>());

  useEffect(() => {
    if (!isSupabaseConfigured || !idsKey) return;
    let cancelled = false;
    const ids = idsFromKey(idsKey);

    const load = async () => {
      let query = supabase.from(table).select('*').in('incident_id', ids);
      for (const [column, ascending] of orderBy) query = query.order(column, { ascending });
      const { data, error } = await query;
      if (cancelled) return;
      const rows = (error ? [] : data || []) as T[];
      shownIds.current = new Set(rows.map(r => r.id));
      setState({ key: idsKey, rows });
    };
    load();

    // DELETE payloads carry only the primary key, so the incident_id filter never matches them.
    const channel = supabase
      .channel(`${table}_${idsKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: incidentIdRealtimeFilter(ids) }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: incidentIdRealtimeFilter(ids) }, load)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, payload => {
        if (shownIds.current.has((payload.old as { id?: string })?.id ?? '')) load();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [table, idsKey, orderBy]);

  return state.key === idsKey ? state.rows : [];
}

const EVACUATION_ORDER: OrderBy = [['updated_at', false]];
const SHELTER_ORDER: OrderBy = [['sort_order', true], ['name', true]];

export function useIncidentEvacuations(incidentId: string, aliasIds: string[]) {
  return useIncidentRows<EvacuationRow>('incident_evacuations', incidentId, aliasIds, EVACUATION_ORDER);
}

export function useIncidentShelters(incidentId: string, aliasIds: string[]) {
  return useIncidentRows<ShelterRow>('incident_shelters', incidentId, aliasIds, SHELTER_ORDER);
}

/** How long a realtime-inserted update stays highlighted. */
const FRESH_UPDATE_MS = 4000;

/**
 * The incident's update timeline, newest first, kept live over realtime. Automated feed diffs only
 * come from the primary id (each source posts its own diff, so alias diffs would double up).
 */
export function useIncidentUpdates(incidentId: string, aliasIds: string[]) {
  const idsKey = incidentIdsKey(incidentId, aliasIds);
  const [state, setState] = useState<{ key: string | null; updates: IncidentUpdate[] }>({ key: null, updates: [] });
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!isSupabaseConfigured || !idsKey) return;
    let cancelled = false;
    const ids = idsFromKey(idsKey);
    const belongs = (row: IncidentUpdate) => row.incident_id === incidentId || row.source_type !== 'automated';
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    supabase
      .from('incident_updates')
      .select('*')
      .in('incident_id', ids)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        setState({ key: idsKey, updates: error ? [] : ((data || []) as IncidentUpdate[]).filter(belongs) });
      });

    const channel = supabase
      .channel(`incident_updates_${idsKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incident_updates', filter: incidentIdRealtimeFilter(ids) },
        payload => {
          const row = (payload.new && 'id' in payload.new ? payload.new : payload.old) as IncidentUpdate;
          if (!row?.id) return;
          if (payload.eventType !== 'DELETE' && !belongs(row)) return;
          if (payload.eventType === 'INSERT') {
            setFreshIds(prev => new Set(prev).add(row.id));
            timers.set(
              row.id,
              setTimeout(() => {
                setFreshIds(prev => {
                  const next = new Set(prev);
                  next.delete(row.id);
                  return next;
                });
              }, FRESH_UPDATE_MS),
            );
          }
          setState(prev => {
            if (prev.key !== idsKey) return prev;
            if (payload.eventType === 'DELETE') return { ...prev, updates: prev.updates.filter(u => u.id !== row.id) };
            if (payload.eventType === 'INSERT') {
              return prev.updates.some(u => u.id === row.id) ? prev : { ...prev, updates: [row, ...prev.updates] };
            }
            return { ...prev, updates: prev.updates.map(u => (u.id === row.id ? { ...u, ...row } : u)) };
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [idsKey, incidentId]);

  return { updates: state.key === idsKey ? state.updates : [], freshIds };
}

/**
 * Follow state for one incident; following stores the name (for notification emails) and aliases
 * (so updates posted under other ids reach followers). canFollow is false when signed out.
 */
export function useIncidentFollow(incidentId: string, incidentName: string, aliasIds: string[]) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const idsKey = incidentIdsKey(incidentId, aliasIds);
  const key = userId && idsKey ? `${userId}:${idsKey}` : null;
  const [state, setState] = useState<{ key: string | null; following: boolean }>({ key: null, following: false });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !key || !userId) return;
    let cancelled = false;
    supabase
      .from('incident_follows')
      .select('incident_id')
      .eq('user_id', userId)
      .in('incident_id', idsFromKey(idsKey))
      .limit(1)
      .then(({ data, error }) => {
        if (!cancelled) setState({ key, following: !error && Boolean(data?.length) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, userId, idsKey]);

  const following = state.key === key && state.following;

  const toggle = useCallback(async () => {
    if (!isSupabaseConfigured || !key || !userId || pending) return;
    const next = !following;
    const [primaryId, ...aliases] = idsFromKey(idsKey);
    setPending(true);
    setState({ key, following: next });
    const { error } = next
      ? await supabase.from('incident_follows').insert({
          user_id: userId,
          incident_id: primaryId,
          incident_name: incidentName ? incidentName.slice(0, 200) : null,
          alias_ids: aliases.slice(0, 20),
        })
      : await supabase.from('incident_follows').delete().eq('user_id', userId).in('incident_id', idsFromKey(idsKey));
    // 23505: already following (another device); the desired state holds.
    if (error && error.code !== '23505') setState({ key, following: !next });
    setPending(false);
  }, [key, userId, idsKey, incidentName, following, pending]);

  return { following, pending, canFollow: Boolean(userId), toggle };
}
