/**
 * Browser entry point. Used by Next.js client components.
 *
 * Imported via `@omnilease/supabase/web-client` to avoid pulling in the
 * server-side `next/headers` dependency.
 */

import { createBrowserClient } from '@supabase/ssr';
import { resolvePublicConfig } from './env';

export function createBrowserSupabase() {
  const { url, anonKey } = resolvePublicConfig();
  return createBrowserClient(url, anonKey);
}
