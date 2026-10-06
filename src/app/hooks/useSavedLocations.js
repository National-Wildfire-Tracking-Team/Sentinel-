/**
 * useSavedLocations.js
 * Manages the current user's saved locations: persistent monitoring targets
 * (name, point, notification radius, notification switches) that
 * notification-sync evaluates every 5 minutes. Separate from "Go to my
 * current location", which only moves the map.
 *
 * The plan limit comes from PLANS (usePlan.js); the database trigger
 * enforce_saved_location_limit is the authoritative check.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';
import { useAuth } from '../../shared/context/AuthContext';
import { fetchAlertsByPoint } from '../api/noaaWeather';
import { usePlan, PLANS } from '../../shared/hooks/usePlan';
import {
  DEFAULT_RADIUS_MILES,
  validateSavedLocationFields,
} from '../../../supabase/functions/_shared/savedLocationAlerts.js';

/** Kept for backwards-compat — components that import this constant still work */
export const FREE_LOCATION_LIMIT = PLANS.free.savedLocationsLimit;

/** Columns a user may change; ownership and timestamps are database-managed. */
const EDITABLE_FIELDS = [
  'name', 'address', 'latitude', 'longitude',
  'notify_radius_miles', 'alerts_enabled', 'notify_new_fires',
];

function pickEditable(updates) {
  return Object.fromEntries(
    Object.entries(updates || {}).filter(([key]) => EDITABLE_FIELDS.includes(key)),
  );
}

export function useSavedLocations() {
  const { user, isAuthenticated } = useAuth();
  const { plan } = usePlan();
  const locationLimit = plan?.savedLocationsLimit ?? FREE_LOCATION_LIMIT;

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
        .order('created_at', { ascending: true });
      if (err) throw err;
      setLocations(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id || !isSupabaseConfigured) {
      setLocations([]);
      return;
    }

    load();

    // Clean up any existing channels for this user before creating a new one.
    // Supabase's realtime client can throw "cannot add postgres_changes
    // callbacks after subscribe()" if a stale channel lingers in its registry.
    const existingChannels = supabase.getChannels?.() ?? [];
    for (const ch of existingChannels) {
      if (ch.topic?.startsWith(`realtime:saved_locations:${user?.id}`)) {
        supabase.removeChannel(ch);
      }
    }

    const channel = supabase
      .channel(`saved_locations:${user?.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saved_locations', filter: `user_id=eq.${user?.id}` },
        () => load()
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      channelRef.current = null;
    };
  }, [isAuthenticated, user?.id, load]);

  const addLocation = useCallback(async ({
    name,
    address = '',
    latitude,
    longitude,
    notifyRadiusMiles = DEFAULT_RADIUS_MILES,
    alertsEnabled = true,
  }) => {
    if (!isAuthenticated || !isSupabaseConfigured) throw new Error('Sign in to save locations');
    if (locations.length >= locationLimit) {
      throw new Error(`Your plan allows up to ${locationLimit} saved locations. Upgrade to add more.`);
    }

    const row = {
      user_id: user.id,
      name: String(name ?? '').trim(),
      address: address || '',
      latitude,
      longitude,
      notify_radius_miles: notifyRadiusMiles,
      alerts_enabled: alertsEnabled,
      notify_new_fires: true,
    };
    const invalid = validateSavedLocationFields(row);
    if (invalid) throw new Error(invalid);

    const { data, error: err } = await supabase
      .from('saved_locations')
      .insert(row)
      .select()
      .single();

    if (err) throw err;
    setLocations(prev => [...prev, data]);
    return data;
  }, [isAuthenticated, user?.id, locations.length, locationLimit]);

  const removeLocation = useCallback(async (id) => {
    const { error: err } = await supabase
      .from('saved_locations')
      .delete()
      .eq('id', id);
    if (err) throw err;
    setLocations(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateLocation = useCallback(async (id, updates) => {
    const changes = pickEditable(updates);
    if ('name' in changes) changes.name = String(changes.name ?? '').trim();
    const invalid = validateSavedLocationFields(changes);
    if (invalid) throw new Error(invalid);

    // RLS ("saved_locations own") limits this to the signed-in user's rows.
    const { data, error: err } = await supabase
      .from('saved_locations')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (err) throw err;
    setLocations(prev => prev.map(l => (l.id === id ? data : l)));
    return data;
  }, []);

  return {
    locations,
    loading,
    error,
    refresh: load,
    addLocation,
    removeLocation,
    updateLocation,
    atLimit: locations.length >= locationLimit,
    overLimit: locations.length > locationLimit,
    limit: locationLimit,
  };
}

/** Fetch active NOAA weather alerts for a lat/lng point. */
export async function fetchLocationAlerts(lat, lng) {
  return fetchAlertsByPoint(lat, lng);
}
