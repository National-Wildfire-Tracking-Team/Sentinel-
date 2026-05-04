/**
 * useRecentUpdates.js
 * Fetches the most recent incident_updates across ALL incidents for the
 * sidebar "Updates" feed. Subscribes to realtime inserts so new entries
 * appear immediately without a page reload.
 */

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';

const LIMIT = 20;

export function useRecentUpdates() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('incident_updates')
        .select('id, incident_id, incident_name, content, source_type, source_name, created_at')
        .order('created_at', { ascending: false })
        .limit(LIMIT);

      if (!cancelled) {
        setUpdates(data || []);
        setLoading(false);
      }
    }

    load();

    // Subscribe to new inserts across all incidents
    const channel = supabase
      .channel('recent_updates_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incident_updates' },
        (payload) => {
          if (!payload.new) return;
          setUpdates(prev => {
            if (prev.some(u => u.id === payload.new.id)) return prev;
            return [payload.new, ...prev].slice(0, LIMIT);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { updates, loading };
}
