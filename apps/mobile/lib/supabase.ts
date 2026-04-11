// React Native Supabase client.
//
// Lives in apps/mobile (not packages/supabase) so the shared package never
// depends on Expo or React Native — keeps the web bundle clean and avoids
// pnpm peer-dep wildcards dragging in mismatched RN versions.
//
// Uses expo-secure-store for the access/refresh tokens (Keychain on iOS,
// Keystore on Android) so the session survives app restarts. SecureStore
// has a 2KB value-per-key limit but Supabase tokens fit comfortably.

import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, type AppStateStatus } from 'react-native';
import { resolvePublicConfig } from '@omnilease/supabase';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

function buildClient(): SupabaseClient {
  // resolvePublicConfig is env-agnostic; pass our Expo-specific env vars
  // through the same fallback list it uses for web.
  const { url, anonKey } = resolvePublicConfig({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });

  const client = createClient(url, anonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // No URL-based session detection in RN; deep-link OAuth callbacks
      // (when we add social sign-in) are handled separately.
      detectSessionInUrl: false,
    },
  });

  // Pause/resume the auto-refresh ticker around app foreground/background
  // to avoid burning battery and to immediately refresh on resume.
  // https://supabase.com/docs/reference/javascript/auth-startautorefresh
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      client.auth.startAutoRefresh();
    } else {
      client.auth.stopAutoRefresh();
    }
  });

  return client;
}

export const supabase: SupabaseClient = buildClient();
