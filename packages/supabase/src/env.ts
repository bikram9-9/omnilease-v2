/**
 * Resolves the Supabase URL + anon key from whichever env var convention is in
 * scope. Web uses NEXT_PUBLIC_*, mobile uses EXPO_PUBLIC_*. Both fall back to
 * the legacy PUBLISHABLE_KEY name we shipped before the rename.
 */

type Env = Record<string, string | undefined>;

export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

function pick(env: Env, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value && value.length > 0) return value;
  }
  return undefined;
}

export function resolvePublicConfig(env: Env = process.env as Env): SupabasePublicConfig {
  const url = pick(env, ['NEXT_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL']);
  const anonKey = pick(env, [
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]);

  if (!url) {
    throw new Error('Missing Supabase URL. Set NEXT_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL.');
  }
  if (!anonKey) {
    throw new Error(
      'Missing Supabase public key. Set NEXT_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  return { url, anonKey };
}
