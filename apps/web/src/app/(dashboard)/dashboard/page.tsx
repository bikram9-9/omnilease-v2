import Link from 'next/link';
import { AlertTriangle, Clock, Target, Users } from 'lucide-react';
import { requireOrg } from '@/lib/auth';
import {
  and,
  db,
  eq,
  count,
  properties,
  conversations,
  escalations,
  isNull,
  sql,
  conversationModelEvents,
} from '@omnilease/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const { orgId } = await requireOrg();
  const [
    [{ value: propertyCount }],
    [{ value: conversationCount }],
    [{ value: openEscalationCount }],
    [{ value: leadLinkedCount }],
    [{ value: avgLatencyMs }],
    topEscalations,
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
    db
      .select({ value: count() })
      .from(conversations)
      .innerJoin(properties, eq(properties.id, conversations.propertyId))
      .where(and(eq(properties.orgId, orgId), sql`${conversations.guestCardId} is not null`)),
    db
      .select({ value: sql<number>`coalesce(round(avg(${conversationModelEvents.latencyMs})), 0)` })
      .from(conversationModelEvents)
      .innerJoin(properties, eq(properties.id, conversationModelEvents.propertyId))
      .where(and(eq(properties.orgId, orgId), eq(conversationModelEvents.status, 'success'))),
    db
      .select({
        reason: escalations.reason,
        value: count(),
      })
      .from(escalations)
      .innerJoin(conversations, eq(conversations.id, escalations.conversationId))
      .innerJoin(properties, eq(properties.id, conversations.propertyId))
      .where(eq(properties.orgId, orgId))
      .groupBy(escalations.reason)
      .orderBy(sql`count(*) desc`)
      .limit(5),
  ]);
  const leadCaptureRate = conversationCount > 0
    ? Math.round((leadLinkedCount / conversationCount) * 100)
    : 0;
  const escalationRate = conversationCount > 0
    ? Math.round((openEscalationCount / conversationCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400">
              <Target className="h-4 w-4" />
              Lead capture
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{leadCaptureRate}%</div>
            <p className="mt-2 text-sm text-zinc-400">{leadLinkedCount} linked conversations</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400">
              <Clock className="h-4 w-4" />
              Avg AI latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{avgLatencyMs}ms</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400">
              <AlertTriangle className="h-4 w-4" />
              Escalation rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{escalationRate}%</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400">
              <Users className="h-4 w-4" />
              Top escalation reasons
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topEscalations.length === 0 ? (
              <p className="text-sm text-zinc-400">No escalations yet.</p>
            ) : (
              topEscalations.map((row) => (
                <div key={row.reason} className="flex justify-between gap-3 text-sm">
                  <span className="truncate text-zinc-300">{row.reason}</span>
                  <span className="text-zinc-500">{row.value}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
