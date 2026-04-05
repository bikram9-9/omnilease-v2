import { requireOrg } from '@/lib/auth';
import { db, eq, count, properties } from '@omnilease/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const { orgId } = await requireOrg();
  const [{ value: propertyCount }] = await db
    .select({ value: count() })
    .from(properties)
    .where(eq(properties.orgId, orgId));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{propertyCount}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">Conversations (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">—</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">Open escalations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">—</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
