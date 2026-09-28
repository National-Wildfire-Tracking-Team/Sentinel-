/**
 * HomeSetupContext.jsx
 * The user's Home Setup — home location plus the alert radius they chose —
 * and the "near me" mode that "Go to My Current Location" turns on.
 *
 * The saved radius is the source of truth for how far out the user cares
 * about. Near-me mode re-centers that radius on their live GPS position
 * (not the saved home), so it follows them as they move. There is no
 * default radius: until Home Setup is completed, near-me mode can't turn on
 * and the locate-me button prompts the user to finish setup instead.
 *
 * Signed-in users' setup lives in Supabase (public.home_setups); anonymous
 * users keep it in localStorage. A setup made while signed out is moved to
 * the account on first sign-in (if the account has none yet) and cleared
 * from the device, so a shared browser doesn't keep one user's home around.
 */

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useApp } from './AppContext';
import { useAuth } from '../../shared/context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../shared/api/supabaseClient';

const STORAGE_KEY = 'sentinel:homeSetup';

/** Radius choices (miles) offered in Home Setup. None is preselected. */
export const HOME_RADIUS_OPTIONS = [5, 10, 25, 50, 100];

function isValidHome(home) {
  return Boolean(home)
    && Number.isFinite(home.latitude)
    && Number.isFinite(home.longitude)
    && Number.isFinite(home.radiusMiles)
    && home.radiusMiles > 0;
}

function readStoredHome() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return isValidHome(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredHome(home) {
  try {
    if (home) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(home));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode etc.) — setup still applies this session.
  }
}

function fromRow(row) {
  if (!row) return null;
  const home = {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    label: row.label || '',
    radiusMiles: Number(row.radius_miles),
  };
  return isValidHome(home) ? home : null;
}

function toRow(userId, home) {
  return {
    user_id: userId,
    latitude: home.latitude,
    longitude: home.longitude,
    label: home.label,
    radius_miles: home.radiusMiles,
    updated_at: new Date().toISOString(),
  };
}

const HomeSetupContext = createContext(null);

export function HomeSetupProvider({ children }) {
  const { openSidebar } = useApp();
  const { user, isAuthenticated } = useAuth();
  const synced = isAuthenticated && isSupabaseConfigured && Boolean(user?.id);
  const userId = synced ? user.id : null;

  const [home, setHome] = useState(readStoredHome);
  const [loading, setLoading] = useState(false);
  const [homeSetupOpen, setHomeSetupOpen] = useState(false);
  const [nearbyActive, setNearbyActive] = useState(false);

  // Load the account's setup on sign-in; fall back to this device's on sign-out.
  useEffect(() => {
    if (!userId) {
      setHome(readStoredHome());
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('home_setups')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw error;
        let next = fromRow(data);
        const local = readStoredHome();
        if (!next && local) {
          const { error: upsertErr } = await supabase.from('home_setups').upsert(toRow(userId, local));
          if (upsertErr) throw upsertErr;
          next = local;
        }
        writeStoredHome(null);
        if (!cancelled) setHome(next);
      } catch (err) {
        console.warn('[HomeSetup] Could not load from Supabase:', err.message);
        if (!cancelled) setHome(readStoredHome());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const saveHome = useCallback(async (next) => {
    const value = {
      latitude: Number(next.latitude),
      longitude: Number(next.longitude),
      label: next.label || '',
      radiusMiles: Number(next.radiusMiles),
    };
    if (!isValidHome(value)) throw new Error('Choose a home location and an alert radius.');
    if (userId) {
      const { error } = await supabase.from('home_setups').upsert(toRow(userId, value));
      if (error) throw new Error(`Could not save Home Setup: ${error.message}`);
    } else {
      writeStoredHome(value);
    }
    setHome(value);
  }, [userId]);

  const clearHome = useCallback(async () => {
    if (userId) {
      const { error } = await supabase.from('home_setups').delete().eq('user_id', userId);
      if (error) throw new Error(`Could not remove Home Setup: ${error.message}`);
    } else {
      writeStoredHome(null);
    }
    setHome(null);
    setNearbyActive(false);
  }, [userId]);

  const openHomeSetup = useCallback(() => {
    openSidebar();
    setHomeSetupOpen(true);
  }, [openSidebar]);
  const closeHomeSetup = useCallback(() => setHomeSetupOpen(false), []);

  const activateNearby = useCallback(() => setNearbyActive(true), []);
  const clearNearby = useCallback(() => setNearbyActive(false), []);

  const isHomeSetupComplete = isValidHome(home);

  const value = useMemo(() => ({
    home,
    isHomeSetupComplete,
    homeSetupLoading: loading,
    saveHome,
    clearHome,
    homeSetupOpen,
    openHomeSetup,
    closeHomeSetup,
    // Near-me mode only exists on top of a completed Home Setup.
    nearbyActive: nearbyActive && isHomeSetupComplete,
    activateNearby,
    clearNearby,
  }), [home, isHomeSetupComplete, loading, saveHome, clearHome, homeSetupOpen, openHomeSetup,
    closeHomeSetup, nearbyActive, activateNearby, clearNearby]);

  return (
    <HomeSetupContext.Provider value={value}>
      {children}
    </HomeSetupContext.Provider>
  );
}

/** Hook to consume Home Setup state */
export function useHomeSetup() {
  const ctx = useContext(HomeSetupContext);
  if (!ctx) throw new Error('useHomeSetup must be used within <HomeSetupProvider>');
  return ctx;
}
