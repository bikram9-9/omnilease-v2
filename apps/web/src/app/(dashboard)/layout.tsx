import { requireOrg } from '@/lib/auth';
import { Sidebar } from '@/components/dashboard/sidebar';
import { TopBar } from '@/components/dashboard/top-bar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar email={ctx.email} orgSlug={ctx.orgSlug} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
