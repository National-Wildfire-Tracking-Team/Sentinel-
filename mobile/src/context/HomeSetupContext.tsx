/**
 * Home Setup and near-me mode, as on the web (src/app/context/HomeSetupContext.jsx): a home location
 * plus the alert radius the user chose. Near-me mode re-centers that radius on the live GPS position,
 * so it follows the user. Until Home Setup is done there is no radius, so near-me can't turn on.
 *
 * Signed-in users' setup lives in Supabase (public.home_setups); signed-out users keep it on the
 * device. A device setup moves to the account on first sign-in if the account has none.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/auth/AuthContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const HOME_RADIUS_OPTIONS = [5, 10, 25, 50, 100];
const STORAGE_KEY = 'sentinel:homeSetup';

export interface Home {
  latitude: number;
  longitude: number;
  label: string;
  radiusMiles: number;
}

interface HomeSetupValue {
  home: Home | null;
  loading: boolean;
  saveHome: (home: Home) => Promise<void>;
  clearHome: () => Promise<void>;
  /** Live GPS position while near-me mode is on. */
  nearby: { latitude: number; longitude: number } | null;
  setNearby: (pos: { latitude: number; longitude: number } | null) => void;
}

function isValidHome(h: any): h is Home {
  return Boolean(h) && Number.isFinite(h.latitude) && Number.isFinite(h.longitude) && Number.isFinite(h.radiusMiles) && h.radiusMiles > 0;
}

async function readStored(): Promise<Home | null> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null');
    return isValidHome(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeStored(home: Home | null) {
  try {
    if (home) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(home));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Device storage unavailable; the setup just won't persist.
  }
}

const toRow = (userId: string, h: Home) => ({
  user_id: userId,
  latitude: h.latitude,
  longitude: h.longitude,
  label: h.label.slice(0, 300),
  radius_miles: h.radiusMiles,
  updated_at: new Date().toISOString(),
});

const HomeSetupContext = createContext<HomeSetupValue | null>(null);

export function HomeSetupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = isSupabaseConfigured ? (user?.id ?? null) : null;
  const [state, setState] = useState<{ key: string | null | undefined; home: Home | null }>({ key: undefined, home: null });
  const home = state.home;
  const loading = state.key !== userId;
  const setHome = useCallback((next: Home | null) => setState({ key: userId, home: next }), [userId]);
  const [nearby, setNearby] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await readStored();
      if (!userId) {
        if (!cancelled) setHome(local);
      } else {
        try {
          const { data, error } = await supabase.from('home_setups').select('*').eq('user_id', userId).maybeSingle();
          if (error) throw error;
          let next: Home | null = data
            ? { latitude: Number(data.latitude), longitude: Number(data.longitude), label: data.label || '', radiusMiles: Number(data.radius_miles) }
            : null;
          if (!isValidHome(next)) next = null;
          if (!next && local) {
            const { error: upsertErr } = await supabase.from('home_setups').upsert(toRow(userId, local));
            if (upsertErr) throw upsertErr;
            next = local;
          }
          await writeStored(null);
          if (!cancelled) setHome(next);
        } catch {
          if (!cancelled) setHome(local);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, setHome]);

  const saveHome = useCallback(
    async (next: Home) => {
      if (!isValidHome(next)) throw new Error('Choose a home location and an alert radius.');
      if (userId) {
        const { error } = await supabase.from('home_setups').upsert(toRow(userId, next));
        if (error) throw new Error(`Could not save Home Setup: ${error.message}`);
      } else {
        await writeStored(next);
      }
      setHome(next);
    },
    [userId, setHome],
  );

  const clearHome = useCallback(async () => {
    if (userId) {
      const { error } = await supabase.from('home_setups').delete().eq('user_id', userId);
      if (error) throw new Error(error.message);
    } else {
      await writeStored(null);
    }
    setHome(null);
    setNearby(null);
  }, [userId, setHome]);

  const value = useMemo(() => ({ home, loading, saveHome, clearHome, nearby, setNearby }), [home, loading, saveHome, clearHome, nearby]);
  return <HomeSetupContext.Provider value={value}>{children}</HomeSetupContext.Provider>;
}

export function useHomeSetup(): HomeSetupValue {
  const ctx = useContext(HomeSetupContext);
  if (!ctx) throw new Error('useHomeSetup must be used inside <HomeSetupProvider>');
  return ctx;
}
