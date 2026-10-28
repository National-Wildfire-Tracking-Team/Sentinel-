/** Fires the signed-in user follows (public.incident_follows), newest first, kept live. */
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface FollowedIncident {
  incident_id: string;
  incident_name: string | null;
  created_at: string;
}

export function useFollowedIncidents() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [follows, setFollows] = useState<FollowedIncident[]>([]);

  const load = useCallback(async () => {
    if (!userId || !isSupabaseConfigured) return;
    const { data, error } = await supabase
      .from('incident_follows')
      .select('incident_id, incident_name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!error) setFollows((data ?? []) as FollowedIncident[]);
  }, [userId]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;
    const first = setTimeout(load, 0);
    const channel = supabase
      .channel(`incident_follows:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_follows', filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const unfollow = useCallback(
    async (incidentId: string) => {
      if (!userId) return;
      setFollows(prev => prev.filter(f => f.incident_id !== incidentId));
      const { error } = await supabase.from('incident_follows').delete().eq('user_id', userId).eq('incident_id', incidentId);
      if (error) load();
    },
    [userId, load],
  );

  return { follows: userId ? follows : [], unfollow };
}
