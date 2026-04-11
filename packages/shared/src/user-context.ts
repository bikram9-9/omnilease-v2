import { z } from 'zod';
import { ROLES, type Role } from './roles';

/**
 * Shape of a row from the public.user_context view (see migration 0002).
 *
 * Both web and mobile parse Supabase responses through this schema so we
 * fail fast on missing fields rather than crashing deep in a render tree.
 */
export const userContextSchema = z.object({
  user_id: z.string().uuid(),
  auth_user_id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(ROLES as unknown as [Role, ...Role[]]),
  org_id: z.string().uuid(),
  org_slug: z.string(),
  org_name: z.string(),
});

export type UserContext = z.infer<typeof userContextSchema>;
