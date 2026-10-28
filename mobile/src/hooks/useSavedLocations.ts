/**
 * The signed-in user's saved locations (public.saved_locations), as on the web
 * (src/app/hooks/useSavedLocations.js): places notification-sync checks every 5 minutes for fires
 * within each one's radius, emailing when alerts are on. Kept live over realtime. The plan limit
 * mirrors the web's PLANS; the database trigger enforce_saved_location_limit is the real check.
 */
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { usePlan, type PlanId } from '@/auth/usePlan';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface SavedLocation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  notify_radius_miles: number;
  alerts_enabled: boolean;
  notify_new_fires: boolean;
  created_at: string;
}

export const RADIUS_OPTIONS_MILES = [5, 10, 25, 50, 100];
export const DEFAULT_RADIUS_MILES = 25;

const LOCATION_LIMITS: Record<PlanId, number> = { free: 4, plus: 10, pro: Infinity, team: 100 };

type Editable = Partial<Pick<SavedLocation, 'name' | 'notify_radius_miles' | 'alerts_enabled' | 'notify_new_fires'>>;

function validate(fields: Editable & { latitude?: number; longitude?: number }): string | null {
  if ('name' in fields) {
    const name = String(fields.name ?? '').trim();
    if (!name) return 'Give this location a name.';
    if (name.length > 120) return 'Location names can be at most 120 characters.';
  }
  if ('notify_radius_miles' in fields) {
    const r = Number(fields.notify_radius_miles);
    if (!Number.isInteger(r) || r < 1 || r > 100) return 'Alert radius must be between 1 and 100 miles.';
  }
  return null;
}

export function useSavedLocations() {
  const { user } = useAuth();
  const { planId } = usePlan();
  const userId = user?.id ?? null;
  const limit = LOCATION_LIMITS[planId];
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !isSupabaseConfigured) return;
    setLoading(true);
    const { data, error: err } = await supabase.from('saved_locations').select('*').order('created_at', { ascending: true });
    setLoading(false);
    if (err) setError(err.message);
    else {
      setError(null);
      setLocations((data ?? []) as SavedLocation[]);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;
    const first = setTimeout(load, 0);
    const channel = supabase
      .channel(`saved_locations:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_locations', filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const addLocation = useCallback(
    async (place: { name: string; address: string; latitude: number; longitude: number; radius?: number }) => {
      if (!userId) throw new Error('Sign in to save locations.');
      if (locations.length >= limit) throw new Error(`Your plan allows ${limit} saved locations. Remove one to add another.`);
      const row = {
        user_id: userId,
        name: place.name.trim().slice(0, 120),
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        notify_radius_miles: place.radius ?? DEFAULT_RADIUS_MILES,
        alerts_enabled: true,
        notify_new_fires: true,
      };
      const invalid = validate(row);
      if (invalid) throw new Error(invalid);
      const { data, error: err } = await supabase.from('saved_locations').insert(row).select().single();
      if (err) throw new Error(err.message.includes('limit') ? `Your plan allows ${limit} saved locations.` : err.message);
      setLocations(prev => (prev.some(l => l.id === data.id) ? prev : [...prev, data as SavedLocation]));
    },
    [userId, locations.length, limit],
  );

  const updateLocation = useCallback(async (id: string, changes: Editable) => {
    const invalid = validate(changes);
    if (invalid) throw new Error(invalid);
    const { data, error: err } = await supabase.from('saved_locations').update(changes).eq('id', id).select().single();
    if (err) throw new Error(err.message);
    setLocations(prev => prev.map(l => (l.id === id ? (data as SavedLocation) : l)));
  }, []);

  const removeLocation = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('saved_locations').delete().eq('id', id);
    if (err) throw new Error(err.message);
    setLocations(prev => prev.filter(l => l.id !== id));
  }, []);

  return { locations: userId ? locations : [], loading, error, limit, addLocation, updateLocation, removeLocation };
}
