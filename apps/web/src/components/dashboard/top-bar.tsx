export function TopBar({ email, orgSlug }: { email: string; orgSlug: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6">
      <div className="text-sm text-zinc-400">
        <span className="text-zinc-500">org:</span>{' '}
        <span className="font-medium text-zinc-200">{orgSlug}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-zinc-400">{email}</span>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
