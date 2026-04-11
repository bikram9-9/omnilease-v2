/**
 * Cross-platform query helpers. Anything that uses a SupabaseClient instance
 * (web OR native) and doesn't depend on platform-specific imports lives here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { userContextSchema, type UserContext } from '@omnilease/shared';

/**
 * Fetch the current user's UserContext via the public.user_context view.
 * Returns null if the auth user has no matching row in public.users (i.e.,
 * they're authenticated but not yet onboarded into an org).
 *
 * Throws if Supabase returns an unexpected error or if the row fails schema
 * validation — both indicate a real bug we want to surface, not silently swallow.
 */
export async function getUserContext(client: SupabaseClient): Promise<UserContext | null> {
  const { data, error } = await client
    .from('user_context')
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load user_context: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return userContextSchema.parse(data);
}
