'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { signIn } from './actions';

export default function SignInPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-semibold">Sign in</h1>
        <form action={onSubmit} className="space-y-4">
          <input
            type="email" name="email" placeholder="email" required autoComplete="email"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
          />
          <input
            type="password" name="password" placeholder="password" required autoComplete="current-password"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit" disabled={isPending}
            className="w-full rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
          >
            {isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center text-sm text-zinc-400">
          No account? <Link href="/sign-up" className="text-zinc-50 underline">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
