/**
 * AuthContext.jsx
 * Supabase Auth provider. Tracks the current session, user, profile role,
 * and subscription plan ("free" | "pro" | "team").
 *
 * The Supabase client is imported on demand. With `deferClient` (the
 * marketing site, which has no sign-in) it isn't loaded at all unless a
 * session could exist (see mightBeSignedIn) or an auth action is called.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { isSupabaseConfigured, REMEMBER_ME_KEY, mightBeSignedIn } from '../api/supabaseSession';
import { authCallbackUrl } from '../utils/authEmail';

const AuthContext = createContext(null);

export function AuthProvider({ children, deferClient = false }) {
  const [client, setClient] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const clientPromise = useRef(null);
  const getClient = useCallback(() => {
    clientPromise.current ??= import('../api/supabaseClient').then(({ supabase }) => {
      setClient(supabase);
      return supabase;
    });
    return clientPromise.current;
  }, []);

  // Load the client on mount, unless it's deferred and nobody can be signed in
  useEffect(() => {
    if (!isSupabaseConfigured || (deferClient && !mightBeSignedIn())) {
      setLoading(false);
      return;
    }
    getClient();
  }, [deferClient, getClient]);

  // Once the client is loaded: read the current session + subscribe to auth changes
  useEffect(() => {
    if (!client) return;

    let active = true;

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = client.auth.onAuthStateChange((_evt, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, [client]);

  // Whenever the signed-in user changes, fetch their profile and subscription
  useEffect(() => {
    if (!isSupabaseConfigured || !client || !session?.user) {
      setProfile(null);
      setSubscription(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    let cancelled = false;
    (async () => {
      const [profileRes, subRes] = await Promise.all([
        client
          .from('profiles')
          .select('id, email, role')
          .eq('id', session.user.id)
          .maybeSingle(),
        client
          .from('subscriptions')
          .select('plan, status, current_period_end, cancel_at_period_end, stripe_customer_id')
          .eq('user_id', session.user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (profileRes.error) {
        console.warn('[Auth] Failed to load profile:', profileRes.error.message);
        setProfile({ id: session.user.id, email: session.user.email, role: 'public' });
      } else {
        setProfile(profileRes.data ?? { id: session.user.id, email: session.user.email, role: 'public' });
      }

      // Default to free plan if no subscription row exists yet
      setSubscription(subRes.data ?? { plan: 'free', status: 'active', cancel_at_period_end: false });

      setProfileLoading(false);
    })();

    return () => { cancelled = true; };
  }, [client, session?.user?.id]);

  const signIn = useCallback(async (email, password, rememberMe = false) => {
    // Set the remember-me flag BEFORE signing in so the storage adapter
    // writes the session to the correct backing store.
    if (rememberMe) {
      localStorage.setItem(REMEMBER_ME_KEY, '1');
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
    }
    const supabase = await getClient();
    const result = await supabase.auth.signInWithPassword({ email, password });
    // Set a cookie marker so the ErrorBoundary can detect an authenticated
    // session even if localStorage is inaccessible.
    if (!result.error && result.data?.session) {
      document.cookie = 'sentinel_auth=1; path=/; max-age=86400; SameSite=Lax';
    }
    return result;
  }, [getClient]);

  const signUp = useCallback(async (email, password, metadata = {}) => {
    const supabase = await getClient();
    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authCallbackUrl(),
        ...(Object.keys(metadata).length ? { data: metadata } : {}),
      },
    });
  }, [getClient]);

  // Re-send the sign-up confirmation link (Supabase allows one per address per minute).
  const resendConfirmation = useCallback(async (email) => {
    const supabase = await getClient();
    return supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authCallbackUrl() },
    });
  }, [getClient]);

  // Email a password-reset link; it lands on /auth/callback's new-password form.
  const requestPasswordReset = useCallback(async (email) => {
    const supabase = await getClient();
    return supabase.auth.resetPasswordForEmail(email, { redirectTo: authCallbackUrl() });
  }, [getClient]);

  const updatePassword = useCallback(async (password) => {
    const supabase = await getClient();
    return supabase.auth.updateUser({ password });
  }, [getClient]);

  const signOut = useCallback(async () => {
    localStorage.removeItem(REMEMBER_ME_KEY);
    document.cookie = 'sentinel_auth=; path=/; max-age=0';
    const supabase = await getClient();
    return supabase.auth.signOut();
  }, [getClient]);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    subscription,
    role: profile?.role ?? null,
    isAdmin: profile?.role === 'admin',
    isReporter: profile?.role === 'reporter',
    isAuthenticated: Boolean(session?.user),
    loading,
    profileLoading,
    isSupabaseConfigured,
    signIn,
    signUp,
    signOut,
    resendConfirmation,
    requestPasswordReset,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
