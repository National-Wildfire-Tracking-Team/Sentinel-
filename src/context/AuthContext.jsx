/**
 * AuthContext.jsx
 * Supabase Auth provider. Tracks the current session, user, and their
 * profile role ("public" | "reporter" | "admin").
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured, REMEMBER_ME_KEY } from '../api/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load current session on mount + subscribe to auth changes
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      active = false;
      sub?.unsubscribe?.();
    };
  }, []);

  // Whenever the signed-in user changes, fetch their profile (for role)
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] Failed to load profile:', error.message);
        setProfile({ id: session.user.id, email: session.user.email, role: 'public' });
      } else {
        setProfile(data ?? { id: session.user.id, email: session.user.email, role: 'public' });
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const signIn = useCallback(async (email, password, rememberMe = false) => {
    // Set the remember-me flag BEFORE signing in so the storage adapter
    // writes the session to the correct backing store.
    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, '1');
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
    }
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signUp = useCallback(async (email, password, metadata = {}) => {
    return supabase.auth.signUp({
      email,
      password,
      options: Object.keys(metadata).length ? { data: metadata } : undefined,
    });
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(REMEMBER_ME_KEY);
    return supabase.auth.signOut();
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    isAdmin: profile?.role === 'admin',
    isReporter: profile?.role === 'reporter',
    isAuthenticated: Boolean(session?.user),
    loading,
    isSupabaseConfigured,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
