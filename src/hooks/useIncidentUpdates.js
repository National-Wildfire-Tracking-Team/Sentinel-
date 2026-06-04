/**
 * useIncidentUpdates.js
 * Hook for fetching, subscribing to, and managing timeline updates
 * for a specific incident. Uses Supabase realtime so new updates
 * appear instantly in the feed.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';
import { subscribeToIncidentChanges } from '../utils/incidentChangeBus';

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
              // Remove any matching local placeholder for this automated update.
              const withoutLocal = prev.filter(
                (u) =>
                  !(
                    u.id.startsWith('local-') &&
                    u.source_type === 'automated' &&
                    u.content === row.content &&
                    Math.abs(new Date(u.created_at) - new Date(row.created_at)) < 10_000
                  ),
              );
              return [row, ...withoutLocal];
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

  // ── Local change bus ───────────────────────────────────────────────────
  // Receives updates published by useIncidents immediately on detection,
  // before (or instead of) the Supabase round-trip completes.
  useEffect(() => {
    if (!incidentId) return undefined;

    const unsubscribe = subscribeToIncidentChanges(incidentId, (localUpdate) => {
      setUpdates((prev) => {
        // Skip if already present (Supabase realtime may have delivered it first).
        if (prev.some((u) => u.id === localUpdate.id)) return prev;
        // Also skip if a real Supabase row with the same content arrived recently.
        const isDupe = prev.some(
          (u) =>
            !u.id.startsWith('local-') &&
            u.source_type === 'automated' &&
            u.content === localUpdate.content &&
            Math.abs(new Date(u.created_at) - new Date(localUpdate.created_at)) < 10_000,
        );
        if (isDupe) return prev;
        return [localUpdate, ...prev];
      });
    });

    return unsubscribe;
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
 * Insert a reporter update from outside the hook (e.g. ReporterDashboardPage).
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
 * Insert an automated update (for WildCAD, FIRMS, IRWIN data changes, etc.).
 * Intended to be called from backend/edge functions or the data-refresh pipeline.
 */
export async function insertAutomatedUpdate({ incidentId, incidentName, content, sourceName }) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from('incident_updates')
    .insert({
      incident_id: incidentId,
      incident_name: incidentName ?? null,
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
