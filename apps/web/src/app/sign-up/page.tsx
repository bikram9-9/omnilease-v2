'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { signUp } from './actions';

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setNeedsConfirmation(false);
    startTransition(async () => {
      const result = await signUp(formData);
      if (result?.error) setError(result.error);
      if (result?.needsConfirmation) setNeedsConfirmation(true);
    });
  }

  if (needsConfirmation) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="mt-3 text-zinc-400">
            We sent a confirmation link to your inbox. Click it to finish signing up.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-semibold">Sign up</h1>
        <form action={onSubmit} className="space-y-4">
          <input
            type="email" name="email" placeholder="email" required autoComplete="email"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
          />
          <input
            type="password" name="password" placeholder="password (min 8 chars)" required
            minLength={8} autoComplete="new-password"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit" disabled={isPending}
            className="w-full rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
          >
            {isPending ? 'Creating account…' : 'Sign up'}
          </button>
        </form>
        <p className="text-center text-sm text-zinc-400">
          Have an account? <Link href="/sign-in" className="text-zinc-50 underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
