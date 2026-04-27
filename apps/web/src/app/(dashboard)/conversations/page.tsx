import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatConversationTime,
  getAutomationStateClasses,
  getAutomationStateLabel,
  getChannelClasses,
  getChannelLabel,
  getEscalationSlaClasses,
  getEscalationSlaLabel,
  getPriorityClasses,
  getProspectLabel,
  getStatusClasses,
  getStatusLabel,
} from '@/components/conversations/helpers';
import { listConversationsForOrg } from './queries';

export default async function ConversationsPage() {
  const { orgId } = await requireOrg();
  const conversations = await listConversationsForOrg(orgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Conversations</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Review inbound leads, escalation context, and property-specific chat history.
          </p>
        </div>
      </div>

      {conversations.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="py-12 text-center text-zinc-400">
            No conversations yet. Start a website chat session to populate the inbox.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((conversation) => {
            const prospectLabel = getProspectLabel({
              prospectName: conversation.prospectName,
              prospectEmail: conversation.prospectEmail,
              prospectPhone: conversation.prospectPhone,
              channel: conversation.channel,
              externalId: conversation.externalId,
            });

            return (
              <Link key={conversation.id} href={`/conversations/${conversation.id}`}>
                <Card className="border-zinc-800 bg-zinc-900 transition hover:border-zinc-700 hover:bg-zinc-900/90">
                  <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <CardTitle>{prospectLabel}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                        <span
                          className={`rounded-full border px-2 py-1 ${getStatusClasses(conversation.status)}`}
                        >
                          {getStatusLabel(conversation.status)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 ${getChannelClasses(conversation.channel)}`}
                        >
                          {getChannelLabel(conversation.channel)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 ${getAutomationStateClasses(conversation.automationState)}`}
                        >
                          {getAutomationStateLabel(conversation.automationState)}
                        </span>
                        <span>{conversation.propertyName}</span>
                      </div>
                    </div>

                    <div className="text-xs text-zinc-500">
                      {formatConversationTime(
                        conversation.latestMessage?.createdAt ?? conversation.createdAt,
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    <p className="line-clamp-2 text-sm text-zinc-300">
                      {conversation.latestMessage?.content ?? 'No messages captured yet.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                      {conversation.prospectEmail && <span>{conversation.prospectEmail}</span>}
                      {conversation.prospectPhone && <span>{conversation.prospectPhone}</span>}
                      {conversation.status === 'escalated' && conversation.escalatedAt && (
                        <span>Escalated {formatConversationTime(conversation.escalatedAt)}</span>
                      )}
                      {conversation.openEscalation && (
                        <>
                          <span
                            className={`rounded-full border px-2 py-1 ${getPriorityClasses(conversation.openEscalation.priority)}`}
                          >
                            {conversation.openEscalation.priority} priority
                          </span>
                          <span className={getEscalationSlaClasses(
                            conversation.openEscalation.priority,
                            conversation.openEscalation.createdAt,
                          )}
                          >
                            {getEscalationSlaLabel(
                              conversation.openEscalation.priority,
                              conversation.openEscalation.createdAt,
                            )}
                          </span>
                          <span>Unresolved</span>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
