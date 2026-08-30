/**
 * useNotificationPreferences.js
 * Manages the current user's email-notification preferences: which NWS
 * alert types they want emailed about (public.notification_preferences).
 * Read by scripts/notification-sync.mjs to decide who to email.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../api/supabaseClient';
import { useAuth } from '../context/AuthContext';

export function useNotificationPreferences() {
  const { user, isAuthenticated } = useAuth();
  const [nwsAlertTypes, setNwsAlertTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !isSupabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('notification_preferences')
        .select('nws_alert_types')
        .eq('user_id', user.id)
        .maybeSingle();
      if (err) throw err;
      setNwsAlertTypes(data?.nws_alert_types || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !isSupabaseConfigured) {
      setNwsAlertTypes([]);
      return;
    }
    load();
  }, [isAuthenticated, load]);

  const setAlertTypes = useCallback(async (types) => {
    if (!isAuthenticated || !isSupabaseConfigured) throw new Error('Sign in to manage notifications');
    const { data, error: err } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, nws_alert_types: types, updated_at: new Date().toISOString() })
      .select('nws_alert_types')
      .single();
    if (err) throw err;
    setNwsAlertTypes(data?.nws_alert_types || []);
  }, [isAuthenticated, user?.id]);

  const toggleAlertType = useCallback((type) => {
    const next = nwsAlertTypes.includes(type)
      ? nwsAlertTypes.filter(t => t !== type)
      : [...nwsAlertTypes, type];
    return setAlertTypes(next);
  }, [nwsAlertTypes, setAlertTypes]);

  return { nwsAlertTypes, loading, error, setAlertTypes, toggleAlertType, refresh: load };
}
