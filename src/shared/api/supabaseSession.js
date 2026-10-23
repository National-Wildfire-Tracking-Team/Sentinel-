/**
 * supabaseSession.js
 * What the auth layer needs to know before the Supabase client is loaded:
 * whether Supabase is configured, and whether this browser could already be
 * signed in. Kept apart from supabaseClient.js, which pulls in ~200 KB of
 * supabase-js, so pages that never sign anyone in can skip that download.
 */

import { readAuthRedirect } from '../utils/authEmail';

export const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Storage key used to track whether the user chose "Remember me".
 * Stored in localStorage itself so the preference survives browser restarts.
 */
export const REMEMBER_ME_KEY = 'sentinel_rmb';

/**
 * Where the client keeps the session: supabase-js's own default
 * (sb-<project ref>-auth-token), passed to it explicitly so this check and
 * the client can't drift apart.
 */
export const AUTH_STORAGE_KEY =
  `sb-${new URL(SUPABASE_URL || 'https://placeholder.supabase.co').hostname.split('.')[0]}-auth-token`;

/**
 * True when a session is stored on this origin (localStorage for "Remember
 * me", sessionStorage otherwise) or the URL carries an email-link sign-in.
 * When false, the client would only report "signed out", so it needn't load.
 */
export function mightBeSignedIn() {
  if (readAuthRedirect(window.location)) return true;
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) !== null
      || sessionStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    // Storage blocked — can't tell, so let the client find out.
    return true;
  }
}
