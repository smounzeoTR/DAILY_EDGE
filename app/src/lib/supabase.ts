import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from './database.types';
import { supabaseAuthStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: copy app/.env.example to app/.env',
  );
}

// Edge Functions called with fetch (streamed answers)
export const supabaseUrl = url;
export const supabaseKey = key;

// Public key only: never the service_role / secret key in the app
export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: supabaseAuthStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in the foreground
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
