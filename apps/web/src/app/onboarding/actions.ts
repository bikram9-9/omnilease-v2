'use server';

import { redirect } from 'next/navigation';
import { db, eq, organizations, users } from '@omnilease/db';
import { createClient } from '@/lib/supabase/server';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
    || 'org';
}

export async function createOrganization(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Idempotency: if this auth user already has a public.users row, skip.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authUserId, user.id))
    .limit(1);
  if (existing) redirect('/dashboard');

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Organization name is required' };

  // Slug uniqueness: try up to 5 times with a random suffix.
  let slug = toSlug(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [clash] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (!clash) break;
    slug = `${toSlug(name)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const [org] = await db
    .insert(organizations)
    .values({ name, slug })
    .returning({ id: organizations.id });

  await db.insert(users).values({
    authUserId: user.id,
    orgId: org.id,
    email: user.email ?? '',
    name: (user.user_metadata?.full_name as string | undefined) ?? null,
    role: 'admin', // first user in a new org is admin
  });

  redirect('/dashboard');
}
