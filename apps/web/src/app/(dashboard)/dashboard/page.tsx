import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { and, db, eq, count, properties, conversations, escalations, isNull } from '@omnilease/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const { orgId } = await requireOrg();
  const [
    [{ value: propertyCount }],
    [{ value: conversationCount }],
    [{ value: openEscalationCount }],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(properties)
      .where(eq(properties.orgId, orgId)),
    db
      .select({ value: count() })
      .from(conversations)
      .innerJoin(properties, eq(properties.id, conversations.propertyId))
      .where(eq(properties.orgId, orgId)),
    db
      .select({ value: count() })
      .from(escalations)
      .innerJoin(conversations, eq(conversations.id, escalations.conversationId))
      .innerJoin(properties, eq(properties.id, conversations.propertyId))
      .where(and(eq(properties.orgId, orgId), isNull(escalations.resolvedAt))),
  ]);

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
            <CardTitle className="text-sm font-medium text-zinc-400">Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{conversationCount}</div>
            <Link href="/conversations" className="mt-2 inline-block text-sm text-zinc-400 hover:text-zinc-200">
              Open inbox
            </Link>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">Open escalations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{openEscalationCount}</div>
            <p className="mt-2 text-sm text-zinc-400">
              Escalated conversations now open directly inside the inbox.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
