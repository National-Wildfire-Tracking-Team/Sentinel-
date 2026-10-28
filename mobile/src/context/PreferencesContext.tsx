/**
 * Display preferences shared with the web (public.display_preferences). The app uses the time
 * format; the web's other columns (popup mode, spotlight, picker anchor) are desktop-only.
 * Signed-out users keep their choice on the device.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/auth/AuthContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { setClockFormat, type ClockFormat } from '@/utils/format';

const STORAGE_KEY = 'sentinel:timeFormat';

interface PreferencesValue {
  timeFormat: ClockFormat;
  setTimeFormat: (format: ClockFormat) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = isSupabaseConfigured ? (user?.id ?? null) : null;
  const [timeFormat, setFormat] = useState<ClockFormat>('12h');

  const apply = useCallback((format: ClockFormat) => {
    setClockFormat(format);
    setFormat(format);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let format: ClockFormat = ((await AsyncStorage.getItem(STORAGE_KEY).catch(() => null)) as ClockFormat) || '12h';
      if (userId) {
        const { data } = await supabase.from('display_preferences').select('time_format').eq('user_id', userId).maybeSingle();
        if (data?.time_format === '12h' || data?.time_format === '24h') format = data.time_format;
      }
      if (!cancelled) apply(format === '24h' ? '24h' : '12h');
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, apply]);

  const setTimeFormat = useCallback(
    async (format: ClockFormat) => {
      apply(format);
      await AsyncStorage.setItem(STORAGE_KEY, format).catch(() => {});
      if (userId) {
        await supabase
          .from('display_preferences')
          .upsert({ user_id: userId, time_format: format, updated_at: new Date().toISOString() });
      }
    },
    [userId, apply],
  );

  const value = useMemo(() => ({ timeFormat, setTimeFormat }), [timeFormat, setTimeFormat]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}
