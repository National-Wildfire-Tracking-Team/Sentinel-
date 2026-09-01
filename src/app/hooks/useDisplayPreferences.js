/**
 * useDisplayPreferences.js
 * Manages the current user's map display preferences — data-picker anchor,
 * time format, map popup mode, popup spotlight, and popup drag handle
 * (public.display_preferences). Anonymous users get client-only defaults
 * that don't persist across reloads.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';
import { useAuth } from '../../shared/context/AuthContext';

export const DEFAULT_DISPLAY_PREFERENCES = {
  dataPickerAnchor: 'center',
  timeFormat: '12h',
  mapPopupMode: 'list',
  popupSpotlight: false,
  spotlightOpacity: 50,
  popupDragHandle: false,
};

function fromRow(row) {
  if (!row) return DEFAULT_DISPLAY_PREFERENCES;
  return {
    dataPickerAnchor: row.data_picker_anchor,
    timeFormat: row.time_format,
    mapPopupMode: row.map_popup_mode,
    popupSpotlight: row.popup_spotlight,
    spotlightOpacity: row.spotlight_opacity,
    popupDragHandle: row.popup_drag_handle,
  };
}

function toRow(userId, prefs) {
  return {
    user_id: userId,
    data_picker_anchor: prefs.dataPickerAnchor,
    time_format: prefs.timeFormat,
    map_popup_mode: prefs.mapPopupMode,
    popup_spotlight: prefs.popupSpotlight,
    spotlight_opacity: prefs.spotlightOpacity,
    popup_drag_handle: prefs.popupDragHandle,
    updated_at: new Date().toISOString(),
  };
}

export function useDisplayPreferences() {
  const { user, isAuthenticated } = useAuth();
  const [prefs, setPrefs] = useState(DEFAULT_DISPLAY_PREFERENCES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !isSupabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('display_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (err) throw err;
      setPrefs(fromRow(data));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !isSupabaseConfigured) {
      setPrefs(DEFAULT_DISPLAY_PREFERENCES);
      return;
    }
    load();
  }, [isAuthenticated, load]);

  const updatePrefs = useCallback(async (partial) => {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    if (!isAuthenticated || !isSupabaseConfigured) return;
    try {
      const { error: err } = await supabase
        .from('display_preferences')
        .upsert(toRow(user.id, next));
      if (err) throw err;
    } catch (err) {
      setError(err.message);
    }
  }, [prefs, isAuthenticated, user?.id]);

  return { prefs, loading, error, updatePrefs, refresh: load };
}
