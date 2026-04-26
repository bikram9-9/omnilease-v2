import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bot, CheckCircle2, PauseCircle, PlayCircle, Send, XCircle } from 'lucide-react';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { LiveMessageList } from '@/components/conversations/live-message-list';
import {
  formatConversationTime,
  getAutomationStateClasses,
  getAutomationStateLabel,
  getChannelClasses,
  getChannelLabel,
  getPriorityClasses,
  getProspectLabel,
  getStatusClasses,
  getStatusLabel,
} from '@/components/conversations/helpers';
import { getConversationDetailForOrg } from '../queries';
import { sendHumanReplyAction, updateConversationAutomationAction } from './actions';

export default async function ConversationDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const { conversation, messages, escalations } = await getConversationDetailForOrg(orgId, id);

  if (!conversation) notFound();

  const isTerminal = conversation.status === 'closed' || conversation.status === 'converted';
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
            <span className={`rounded-full border px-2 py-1 ${getAutomationStateClasses(conversation.automationState)}`}>
              {getAutomationStateLabel(conversation.automationState)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Message history</CardTitle>
            </CardHeader>
            <CardContent>
              <LiveMessageList conversationId={conversation.id} initialMessages={messages} />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Reply</CardTitle>
            </CardHeader>
            <CardContent>
              {isTerminal ? (
                <p className="text-sm text-zinc-400">
                  This conversation is {getStatusLabel(conversation.status).toLowerCase()}.
                </p>
              ) : (
                <form action={sendHumanReplyAction} className="space-y-3">
                  <input type="hidden" name="conversationId" value={conversation.id} />
                  <Textarea
                    name="content"
                    minLength={1}
                    required
                    placeholder="Write a reply..."
                    className="min-h-28 border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" className="bg-zinc-100 text-zinc-950 hover:bg-zinc-200">
                      <Send data-icon="inline-start" />
                      Send
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

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
              {conversation.guestCardId && (
                <Link
                  href={`/guest-cards/${conversation.guestCardId}`}
                  className="inline-flex text-sm text-zinc-300 hover:text-zinc-100"
                >
                  View guest card
                </Link>
              )}
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
              <DetailRow label="Automation" value={getAutomationStateLabel(conversation.automationState)} />
              <DetailRow
                label="Assigned agent"
                value={conversation.assignedAgentName ?? conversation.assignedAgentId}
              />
              <DetailRow
                label="Escalated at"
                value={conversation.escalatedAt ? formatConversationTime(conversation.escalatedAt) : null}
              />
              <DetailRow label="Escalation reason" value={conversation.escalationReason} />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateConversationAutomationAction} className="grid grid-cols-2 gap-2">
                <input type="hidden" name="conversationId" value={conversation.id} />
                {conversation.automationState === 'human_takeover' && !isTerminal ? (
                  <Button type="submit" name="action" value="return_to_ai" variant="outline">
                    <PlayCircle data-icon="inline-start" />
                    Return to AI
                  </Button>
                ) : !isTerminal ? (
                  <Button type="submit" name="action" value="take_over" variant="outline">
                    <PauseCircle data-icon="inline-start" />
                    Take over
                  </Button>
                ) : (
                  <Button type="button" variant="outline" disabled>
                    <Bot data-icon="inline-start" />
                    Locked
                  </Button>
                )}
                <Button type="submit" name="action" value="close" variant="outline" disabled={isTerminal}>
                  <XCircle data-icon="inline-start" />
                  Close
                </Button>
                <Button type="submit" name="action" value="convert" variant="outline" disabled={isTerminal}>
                  <CheckCircle2 data-icon="inline-start" />
                  Converted
                </Button>
              </form>
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
