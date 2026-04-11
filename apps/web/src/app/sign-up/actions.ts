'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const proto = headerList.get('x-forwarded-proto') ?? 'http';
  const baseUrl = host ? `${proto}://${host}` : 'http://localhost:3000';

  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  if (!data.session) return { needsConfirmation: true };
  redirect('/onboarding');
}
