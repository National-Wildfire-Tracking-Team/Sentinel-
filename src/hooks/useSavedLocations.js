/**
 * useSavedLocations.js
 * Manages saved locations for the current user (free tier: max 4).
 * Persists to Supabase; falls back gracefully when not configured.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { fetchAlertsByPoint } from '../api/noaaWeather';

export const FREE_LOCATION_LIMIT = 4;

export function useSavedLocations() {
  const { user, isAuthenticated } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !isSupabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('saved_locations')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(FREE_LOCATION_LIMIT);
      if (err) throw err;
      setLocations(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !isSupabaseConfigured) {
      setLocations([]);
      return;
    }

    load();

    // Realtime subscription for cross-tab/device sync
    channelRef.current = supabase
      .channel(`saved_locations:${user?.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saved_locations', filter: `user_id=eq.${user?.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, user?.id, load]);

  const addLocation = useCallback(async ({ name, address, latitude, longitude }) => {
    if (!isAuthenticated || !isSupabaseConfigured) throw new Error('Sign in to save locations');
    if (locations.length >= FREE_LOCATION_LIMIT) {
      throw new Error(`Free accounts are limited to ${FREE_LOCATION_LIMIT} saved locations`);
    }

    const { data, error: err } = await supabase
      .from('saved_locations')
      .insert({ user_id: user.id, name, address, latitude, longitude, alerts_enabled: true })
      .select()
      .single();

    if (err) throw err;
    setLocations(prev => [...prev, data]);
    return data;
  }, [isAuthenticated, user?.id, locations.length]);

  const removeLocation = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('saved_locations')
      .delete()
      .eq('id', id);
    if (err) throw err;
    setLocations(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateLocation = useCallback(async (id, updates) => {
    const { data, error: err } = await supabase
      .from('saved_locations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (err) throw err;
    setLocations(prev => prev.map(l => (l.id === id ? data : l)));
    return data;
  }, []);

  return {
    locations: locations.slice(0, FREE_LOCATION_LIMIT),
    loading,
    error,
    refresh: load,
    addLocation,
    removeLocation,
    updateLocation,
    atLimit: locations.length >= FREE_LOCATION_LIMIT,
    limit: FREE_LOCATION_LIMIT,
  };
}

/** Fetch active NOAA weather alerts for a lat/lng point. */
export async function fetchLocationAlerts(lat, lng) {
  return fetchAlertsByPoint(lat, lng);
}
