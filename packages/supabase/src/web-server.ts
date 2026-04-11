/**
 * Server entry point. Used by Next.js Server Components, Server Actions,
 * and Route Handlers. Reads & writes the Supabase auth cookies via next/headers.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolvePublicConfig } from './env';

export async function createServerSupabase() {
  const cookieStore = await cookies();
  const { url, anonKey } = resolvePublicConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies — middleware handles refresh.
        }
      },
    },
  });
}
