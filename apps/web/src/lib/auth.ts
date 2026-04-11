import { redirect } from 'next/navigation';
import { db, eq, organizations, users } from '@omnilease/db';
import { createClient } from '@/lib/supabase/server';
import type { Role } from '@omnilease/shared';

export type AuthContext = {
  userId: string;      // internal public.users.id
  authUserId: string;  // auth.users.id
  email: string;
  orgId: string;
  orgSlug: string;
  role: Role;
};

export async function requireOrg(): Promise<AuthContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [row] = await db
    .select({
      userId: users.id,
      authUserId: users.authUserId,
      email: users.email,
      role: users.role,
      orgId: users.orgId,
      orgSlug: organizations.slug,
    })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(eq(users.authUserId, user.id))
    .limit(1);

  if (!row) redirect('/onboarding');
  return {
    userId: row.userId,
    authUserId: row.authUserId,
    email: row.email,
    orgId: row.orgId,
    orgSlug: row.orgSlug,
    role: row.role as Role,
  };
}
