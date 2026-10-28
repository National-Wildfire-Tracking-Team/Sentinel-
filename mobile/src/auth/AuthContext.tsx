/**
 * Auth state for the app, mirroring the web's src/shared/context/AuthContext.jsx:
 * email/password sign-in, then the user's `profiles` role and `subscriptions` plan.
 * The Supabase session is persisted on device, so users stay signed in across launches.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { WEB_APP_URL } from '@/config/env';

export type Role = 'public' | 'reporter' | 'admin';

export interface Subscription {
  plan: string;
  status: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
}

interface AuthValue {
  /** True until the stored session has been read. */
  initializing: boolean;
  session: Session | null;
  user: User | null;
  role: Role;
  subscription: Subscription;
  isAuthenticated: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const FREE_PLAN: Subscription = { plan: 'free', status: 'active' };

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  // Role and plan for the user they were fetched for; a different (or no) user reads as public/free.
  const [account, setAccount] = useState<{ userId: string; role: Role; subscription: Subscription } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => mounted && setSession(data.session))
      .finally(() => mounted && setInitializing(false));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [profile, sub] = await Promise.all([
        supabase.from('profiles').select('id, email, role').eq('id', userId).maybeSingle(),
        supabase
          .from('subscriptions')
          .select('plan, status, current_period_end, cancel_at_period_end')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setAccount({
        userId,
        role: (profile.data?.role as Role) || 'public',
        subscription: (sub.data as Subscription) || FREE_PLAN,
      });
    })().catch(() => {
      // Profile lookups are best-effort; the session itself is still valid.
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    // The reset link finishes on the website, same as a web-initiated reset.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${WEB_APP_URL}/auth/callback`,
    });
    if (error) throw error;
  }, []);

  const current = account && account.userId === userId ? account : null;
  const role = current?.role ?? 'public';
  const subscription = current?.subscription ?? FREE_PLAN;

  const value = useMemo<AuthValue>(
    () => ({
      initializing,
      session,
      user: session?.user ?? null,
      role,
      subscription,
      isAuthenticated: Boolean(session?.user),
      isConfigured: isSupabaseConfigured,
      signIn,
      signOut,
      resetPassword,
    }),
    [initializing, session, role, subscription, signIn, signOut, resetPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
