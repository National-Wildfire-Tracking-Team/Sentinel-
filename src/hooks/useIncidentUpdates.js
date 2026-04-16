/**
 * useIncidentUpdates.js
 * Hook for fetching, subscribing to, and managing timeline updates
 * for a specific incident. Uses Supabase realtime so new updates
 * appear instantly in the feed.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';

/**
 * Subscribe to the live update feed for an incident.
 * Returns updates in reverse-chronological order (newest first).
 *
 * @param {string|null} incidentId  The incident identifier (IRWIN ID, fire name, etc.)
 * @returns {{ updates, loading, error, addUpdate, editUpdate, deleteUpdate }}
 */
export function useIncidentUpdates(incidentId) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Initial fetch ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !incidentId) {
      setUpdates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('incident_updates')
      .select('id, incident_id, content, source_type, source_name, user_id, created_at')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err);
      setUpdates([]);
    } else {
      setError(null);
      setUpdates(data || []);
    }
    setLoading(false);
  }, [incidentId]);

  useEffect(() => { load(); }, [load]);

  // ── Realtime subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !incidentId) return undefined;

    const channel = supabase
      .channel(`incident_updates_${incidentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incident_updates',
          filter: `incident_id=eq.${incidentId}`,
        },
        (payload) => {
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

    return () => { supabase.removeChannel(channel); };
  }, [incidentId]);

  // ── CRUD helpers ───────────────────────────────────────────────────────

  /** Add a reporter update. */
  const addUpdate = useCallback(
    async ({ content, sourceName, userId }) => {
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

  return { updates, loading, error, addUpdate, editUpdate, deleteUpdate, refresh: load };
}

/**
 * Insert a reporter update from outside the hook (e.g. SubmitReportPage).
 * Mirrors the addUpdate callback but as a standalone async function.
 */
export async function insertReporterUpdate({ incidentId, content, sourceName, userId }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from('incident_updates')
    .insert({
      incident_id: incidentId,
      content,
      source_type: 'reporter',
      source_name: sourceName,
      user_id: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Insert an automated update (for WildCAD, FIRMS, or other system sources).
 * Intended to be called from backend/edge functions or admin tools.
 */
export async function insertAutomatedUpdate({ incidentId, content, sourceName }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from('incident_updates')
    .insert({
      incident_id: incidentId,
      content,
      source_type: 'automated',
      source_name: sourceName,
      user_id: null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
