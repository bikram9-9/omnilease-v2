import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LiveMessageList } from '@/components/conversations/live-message-list';
import {
  formatConversationTime,
  getChannelClasses,
  getChannelLabel,
  getPriorityClasses,
  getProspectLabel,
  getStatusClasses,
  getStatusLabel,
} from '@/components/conversations/helpers';
import { getConversationDetailForOrg } from '../queries';

export default async function ConversationDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const { conversation, messages, escalations } = await getConversationDetailForOrg(orgId, id);

  if (!conversation) notFound();

  const prospectLabel = getProspectLabel({
    prospectName: conversation.prospectName,
    prospectEmail: conversation.prospectEmail,
    prospectPhone: conversation.prospectPhone,
    channel: conversation.channel,
    externalId: conversation.externalId,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href="/conversations" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Back to conversations
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">{prospectLabel}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {conversation.propertyName} · started {formatConversationTime(conversation.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full border px-2 py-1 ${getStatusClasses(conversation.status)}`}>
              {getStatusLabel(conversation.status)}
            </span>
            <span className={`rounded-full border px-2 py-1 ${getChannelClasses(conversation.channel)}`}>
              {getChannelLabel(conversation.channel)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader>
            <CardTitle>Message history</CardTitle>
          </CardHeader>
          <CardContent>
            <LiveMessageList conversationId={conversation.id} initialMessages={messages} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Prospect details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Name" value={conversation.prospectName} />
              <DetailRow label="Email" value={conversation.prospectEmail} />
              <DetailRow label="Phone" value={conversation.prospectPhone} />
              <DetailRow label="Move-in date" value={conversation.moveInDate} />
              <DetailRow label="Unit preference" value={conversation.unitPreference} />
              <DetailRow label="External ID" value={conversation.externalId} />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Conversation status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Property" value={conversation.propertyName} />
              <DetailRow label="Channel" value={getChannelLabel(conversation.channel)} />
              <DetailRow label="Status" value={getStatusLabel(conversation.status)} />
              <DetailRow
                label="Escalated at"
                value={conversation.escalatedAt ? formatConversationTime(conversation.escalatedAt) : null}
              />
              <DetailRow label="Escalation reason" value={conversation.escalationReason} />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Escalations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {escalations.length === 0 ? (
                <p className="text-sm text-zinc-400">No escalation rows have been recorded yet.</p>
              ) : (
                escalations.map((escalation, index) => (
                  <div key={escalation.id} className="space-y-2">
                    {index > 0 && <Separator className="bg-zinc-800" />}
                    <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                      <span
                        className={`rounded-full border px-2 py-1 ${getPriorityClasses(escalation.priority)}`}
                      >
                        {escalation.priority}
                      </span>
                      <span>{formatConversationTime(escalation.createdAt)}</span>
                    </div>
                    <p className="text-sm text-zinc-300">{escalation.reason}</p>
                    {escalation.resolvedAt && (
                      <p className="text-xs text-zinc-500">
                        Resolved {formatConversationTime(escalation.resolvedAt)}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-zinc-200">{value ?? '—'}</div>
    </div>
  );
}
