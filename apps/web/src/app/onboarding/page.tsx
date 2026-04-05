'use client';

import { useState, useTransition } from 'react';
import { createOrganization } from './actions';

export default function OnboardingPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createOrganization(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Create your organization</h1>
          <p className="mt-2 text-sm text-zinc-400">
            This is the company or portfolio that owns your properties.
          </p>
        </div>
        <form action={onSubmit} className="space-y-4">
          <input
            type="text" name="name" placeholder="e.g. Gulf Breeze Holdings"
            required maxLength={200} autoFocus
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit" disabled={isPending}
            className="w-full rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
          >
            {isPending ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </div>
    </main>
  );
}
