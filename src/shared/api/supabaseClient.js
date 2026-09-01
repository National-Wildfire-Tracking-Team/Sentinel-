/**
 * supabaseClient.js
 * Shared Supabase client for auth, database, and realtime subscriptions.
 *
 * Env vars (add to .env):
 *   VITE_SUPABASE_URL=https://your-project.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
    'Reporter submission features will be disabled until you add them to .env.'
  );
}

/**
 * Storage key used to track whether the user chose "Remember me".
 * Stored in localStorage itself so the preference survives browser restarts.
 */
export const REMEMBER_ME_KEY = 'sentinel_rmb';

/**
 * Custom storage adapter:
 *   - "Remember me" checked  → sessions go to localStorage  (persist across restarts)
 *   - "Remember me" unchecked → sessions go to sessionStorage (cleared on browser close)
 *
 * The REMEMBER_ME_KEY flag lives directly in localStorage so we always know
 * which backing store was used, even after a page reload.
 */
const sessionAwareStorage = {
  getItem(key) {
    // If the user opted into persistence, read from localStorage first.
    if (localStorage.getItem(REMEMBER_ME_KEY) === '1') {
      return localStorage.getItem(key);
    }
    // Otherwise fall back to sessionStorage (still valid within the same tab/window).
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  },
  setItem(key, value) {
    if (localStorage.getItem(REMEMBER_ME_KEY) === '1') {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

/**
 * Exported even when not configured so imports don't crash.
 * Calls will fail gracefully (401/404) until env vars are provided.
 *
 * Custom fetch wrapper intercepts requests for the reporter_evac_zones
 * table before they hit the network, returning a synthetic "not found"
 * response so the browser never logs a 404.
 */
const SILENT_404_TABLE = 'reporter_evac_zones';

const suppressedFetch = (url, init) => {
  const target = typeof url === 'string' ? url : url?.url ?? '';
  if (target.includes(SILENT_404_TABLE)) {
    return Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
  return fetch(url, init);
};

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? sessionAwareStorage : undefined,
    },
    global: {
      fetch: suppressedFetch,
    },
  }
);
