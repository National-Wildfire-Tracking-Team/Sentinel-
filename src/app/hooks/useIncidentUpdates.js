/**
 * useIncidentUpdates.js
 * Hook for fetching, subscribing to, and managing timeline updates
 * for a specific incident. Uses Supabase realtime so new updates
 * appear instantly in the feed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';
import { idsFromKey, incidentIdRealtimeFilter, incidentIdsKey } from '../utils/incidentAliases';

/**
 * Rows from the fire's alias ids: reporter posts always belong, but automated
 * feed diffs only from the primary id — incident-updates-sync posts one diff
 * per source (IRWIN and CAL FIRE), and only the primary record's source is
 * the one being displayed, so alias diffs would show each change twice.
 */
function belongsToFeed(row, primaryId) {
  return row.incident_id === primaryId || row.source_type !== 'automated';
}

/** How long a realtime-inserted update stays marked as fresh (highlighted). */
export const FRESH_UPDATE_MS = 4000;

/**
 * Subscribe to the live update feed for an incident.
 * Returns updates in reverse-chronological order (newest first).
 *
 * @param {string|null} incidentId  The incident identifier (IRWIN ID, fire name, etc.)
 * @param {string[]} [aliasIds]     Other ids the same fire is known by; their
 *                                  updates are merged into the feed. New posts
 *                                  always go to incidentId.
 * Rows that arrive over realtime are listed in `freshIds` for
 * FRESH_UPDATE_MS so the UI can highlight them; `lastInsertAt` is the time
 * the most recent one arrived (0 if none since the feed opened).
 *
 * @returns {{ updates, loading, error, freshIds, lastInsertAt, addUpdate, editUpdate, deleteUpdate, refresh }}
 */
export function useIncidentUpdates(incidentId, aliasIds) {
  const idsKey = incidentIdsKey(incidentId, aliasIds);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [freshIds, setFreshIds] = useState(() => new Set());
  const [lastInsertAt, setLastInsertAt] = useState(0);
  const freshTimers = useRef(new Map());

  // ── Initial fetch ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !idsKey) {
      setUpdates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('incident_updates')
      .select('*')
      .in('incident_id', idsFromKey(idsKey))
      .order('created_at', { ascending: false });

    if (err) {
      setError(err);
      setUpdates([]);
    } else {
      setError(null);
      setUpdates((data || []).filter((row) => belongsToFeed(row, incidentId)));
    }
    setLoading(false);
  }, [idsKey, incidentId]);

  useEffect(() => { load(); }, [load]);

  // ── Realtime subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !idsKey) return undefined;
    const timers = freshTimers.current;

    const markFresh = (id) => {
      clearTimeout(timers.get(id));
      setFreshIds((prev) => new Set(prev).add(id));
      setLastInsertAt(Date.now());
      timers.set(id, setTimeout(() => {
        timers.delete(id);
        setFreshIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, FRESH_UPDATE_MS));
    };

    const channel = supabase
      .channel(`incident_updates_${idsKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incident_updates',
          filter: incidentIdRealtimeFilter(idsFromKey(idsKey)),
        },
        (payload) => {
          if (payload.new?.incident_id && !belongsToFeed(payload.new, incidentId)) return;
          if (payload.eventType === 'INSERT' && payload.new?.id) markFresh(payload.new.id);
          setUpdates((prev) => {
            const row = payload.new || payload.old;
            if (!row) return prev;

            if (payload.eventType === 'DELETE') {
              return prev.filter((u) => u.id !== row.id);
            }
            if (payload.eventType === 'INSERT') {
              if (prev.some((u) => u.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((u) => (u.id === row.id ? { ...u, ...row } : u));
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      timers.forEach(clearTimeout);
      timers.clear();
      setFreshIds(new Set());
      setLastInsertAt(0);
    };
  }, [idsKey, incidentId]);

  // ── CRUD helpers ───────────────────────────────────────────────────────

  /** Add a reporter update. `updateType` omitted → column default. */
  const addUpdate = useCallback(
    async ({ content, sourceName, userId, photoUrls, updateType }) => {
      if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
      if (!incidentId) throw new Error('No incident selected');

      const { data, error: err } = await supabase
        .from('incident_updates')
        .insert({
          incident_id: incidentId,
          content,
          source_type: 'reporter',
          source_name: sourceName,
          user_id: userId,
          photo_urls: photoUrls ?? [],
          ...(updateType ? { update_type: updateType } : {}),
        })
        .select()
        .single();

      if (err) throw err;
      return data;
    },
    [incidentId],
  );

  /** Edit the content of an existing update (only own). */
  const editUpdate = useCallback(async (updateId, newContent) => {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

    const { data, error: err } = await supabase
      .from('incident_updates')
      .update({ content: newContent })
      .eq('id', updateId)
      .select()
      .single();

    if (err) throw err;
    return data;
  }, []);

  /** Delete an update (only own). */
  const deleteUpdate = useCallback(async (updateId) => {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

    const { error: err } = await supabase
      .from('incident_updates')
      .delete()
      .eq('id', updateId);

    if (err) throw err;
  }, []);

  return { updates, loading, error, freshIds, lastInsertAt, addUpdate, editUpdate, deleteUpdate, refresh: load };
}

/**
 * Insert a reporter update from outside the hook (e.g. ReporterDashboardPage).
 * Mirrors the addUpdate callback but as a standalone async function.
 */
export async function insertReporterUpdate({ incidentId, content, sourceName, userId, photoUrls, updateType }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from('incident_updates')
    .insert({
      incident_id: incidentId,
      content,
      source_type: 'reporter',
      source_name: sourceName,
      user_id: userId,
      photo_urls: photoUrls ?? [],
      ...(updateType ? { update_type: updateType } : {}),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Insert an automated update (for WildCAD, FIRMS, IRWIN data changes, etc.).
 * Intended to be called from backend/edge functions or the data-refresh pipeline.
 *
 * @param {string} [dedupKey] Stable key for updates that must only ever be
 *   posted once per incident (e.g. the initial "new fire reported" notice).
 *   When provided, a repeat call with the same key is silently ignored
 *   instead of inserting a duplicate row — this guards against the same
 *   "new" incident being re-detected by a client poller (e.g. after briefly
 *   dropping out of the upstream feed) or by multiple open browser tabs.
 *   Omit for updates that legitimately repeat over time (status/acreage/
 *   containment changes).
 */
export async function insertAutomatedUpdate({ incidentId, incidentName, content, sourceName, dedupKey }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from('incident_updates')
    .upsert(
      {
        incident_id: incidentId,
        incident_name: incidentName ?? null,
        content,
        source_type: 'automated',
        source_name: sourceName,
        user_id: null,
        dedup_key: dedupKey ?? null,
      },
      { onConflict: 'dedup_key', ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}
