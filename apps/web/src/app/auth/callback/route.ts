import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/sign-in', request.url), { status: 303 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=auth_callback_failed', request.url), {
      status: 303,
    });
  }

  return NextResponse.redirect(new URL('/dashboard', request.url), { status: 303 });
}
