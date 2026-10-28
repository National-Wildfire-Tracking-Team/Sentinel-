/**
 * Supabase client for the app: same project and anon key as the web app
 * (src/shared/api/supabaseClient.js). The session persists in on-device storage and is refreshed
 * while the app is in the foreground.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { ENV, isSupabaseConfigured } from '@/config/env';

export const supabase = createClient(
  ENV.supabaseUrl || 'https://placeholder.supabase.co',
  ENV.supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      storageKey: 'sentinel-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

export { isSupabaseConfigured };

// React Native has no visibility events; pause token refresh while backgrounded.
AppState.addEventListener('change', state => {
  if (!isSupabaseConfigured) return;
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
