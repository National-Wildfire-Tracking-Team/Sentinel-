/**
 * useIncidentDetails.js
 * Structured incident data for the incident detail panel: evacuation levels,
 * shelters, and the signed-in user's follow state. Evacuations and shelters
 * are small per-incident tables, so any realtime change simply refetches.
 * A missing table (migration not applied yet) reads as "no data".
 *
 * Every reader takes the fire's alias ids (see utils/incidentAliases.js) and
 * reads across all of them; writers use the primary id and clean up alias
 * rows they supersede, so data converges on the current primary id.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';
import { useAuth } from '../../shared/context/AuthContext';
import { idsFromKey, incidentIdRealtimeFilter, incidentIdsKey, parseAliasIds } from '../utils/incidentAliases';

/** orderBy: [[column, ascending], ...] */
function useIncidentRows(table, incidentId, aliasIds, orderBy) {
  const idsKey = incidentIdsKey(incidentId, aliasIds);
  const [state, setState] = useState({ key: null, rows: [] });

  useEffect(() => {
    if (!isSupabaseConfigured || !idsKey) return undefined;
    let cancelled = false;
    const ids = idsFromKey(idsKey);

    const load = async () => {
      let query = supabase.from(table).select('*').in('incident_id', ids);
      for (const [column, ascending] of orderBy) query = query.order(column, { ascending });
      const { data, error } = await query;
      if (!cancelled) setState({ key: idsKey, rows: error ? [] : data || [] });
    };
    load();

    const channel = supabase
      .channel(`${table}_${idsKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: incidentIdRealtimeFilter(ids) },
        () => { load(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [table, idsKey, orderBy]);

  return state.key === idsKey ? state.rows : [];
}

// Newest first, so a level present under both the primary id and an alias
// resolves to the most recently edited row.
const EVACUATION_ORDER = [['updated_at', false]];
const SHELTER_ORDER = [['sort_order', true], ['name', true]];

/** incident_evacuations rows, newest first (at most one per level per id). */
export function useIncidentEvacuations(incidentId, aliasIds) {
  return useIncidentRows('incident_evacuations', incidentId, aliasIds, EVACUATION_ORDER);
}

/** incident_shelters rows in display order. */
export function useIncidentShelters(incidentId, aliasIds) {
  return useIncidentRows('incident_shelters', incidentId, aliasIds, SHELTER_ORDER);
}

/**
 * Follow state for one incident. `incidentName` is stored with the follow so
 * notification emails can name it; `aliasIds` so updates posted under the
 * fire's other ids reach followers too. A follow made under any of the ids
 * counts as following.
 * @returns {{ following: boolean, pending: boolean, canFollow: boolean, toggle: () => Promise<void> }}
 *   canFollow is false when signed out; the caller should send the user to sign in.
 */
export function useIncidentFollow(incidentId, incidentName, aliasIds) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const idsKey = incidentIdsKey(incidentId, aliasIds);
  const key = userId && idsKey ? `${userId}:${idsKey}` : null;
  const [state, setState] = useState({ key: null, following: false });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !key) return undefined;
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
    return () => { cancelled = true; };
  }, [key, userId, idsKey]);

  const following = state.key === key && state.following;

  const toggle = useCallback(async () => {
    if (!isSupabaseConfigured || !key || pending) return;
    const next = !following;
    const [primaryId, ...aliases] = idsFromKey(idsKey);
    setPending(true);
    setState({ key, following: next });
    const { error } = next
      ? await supabase.from('incident_follows').insert({
        user_id: userId,
        incident_id: primaryId,
        incident_name: incidentName ? String(incidentName).slice(0, 200) : null,
        alias_ids: aliases,
      })
      : await supabase.from('incident_follows').delete().eq('user_id', userId).in('incident_id', idsFromKey(idsKey));
    // 23505: already following (another tab) — the desired state holds.
    if (error && error.code !== '23505') setState({ key, following: !next });
    setPending(false);
  }, [key, userId, idsKey, incidentName, following, pending]);

  return { following, pending, canFollow: Boolean(userId), toggle };
}

// ─── Reporter writes (RLS: reporters and admins) ────────────────────────────

/**
 * Replace an incident's evacuation levels. `levels` maps 'order' / 'warning'
 * to { zones: string[] } when in effect, or null to lift it. Notes and links
 * are shared and written to every level that's in effect. Rows stored under
 * the fire's alias ids are removed so the primary id holds the only copy
 * (otherwise lifting a level would let an older alias row reappear).
 */
export async function saveIncidentEvacuations({ incidentId, aliasIds, levels, notes, links, userId }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const active = Object.entries(levels).filter(([, v]) => v);
  const lifted = Object.entries(levels).filter(([, v]) => !v).map(([level]) => level);
  const aliases = parseAliasIds(aliasIds).filter((id) => id !== String(incidentId));

  if (active.length) {
    const { error } = await supabase.from('incident_evacuations').upsert(
      active.map(([level, v]) => ({
        incident_id: incidentId,
        level,
        zones: v.zones,
        notes: notes || null,
        links,
        created_by: userId,
      })),
      { onConflict: 'incident_id,level' },
    );
    if (error) throw error;
  }
  if (aliases.length) {
    const { error } = await supabase.from('incident_evacuations').delete().in('incident_id', aliases);
    if (error) throw error;
  }
  if (lifted.length) {
    const { error } = await supabase
      .from('incident_evacuations')
      .delete()
      .eq('incident_id', incidentId)
      .in('level', lifted);
    if (error) throw error;
  }
}

/** Insert (no id) or update (id) a shelter. */
export async function saveIncidentShelter({ id, incidentId, userId, ...fields }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = id
    ? await supabase.from('incident_shelters').update(fields).eq('id', id)
    : await supabase.from('incident_shelters').insert({ ...fields, incident_id: incidentId, created_by: userId });
  if (error) throw error;
}

export async function deleteIncidentShelter(id) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('incident_shelters').delete().eq('id', id);
  if (error) throw error;
}
