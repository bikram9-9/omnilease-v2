import {
  and,
  db,
  eq,
  conversations,
  messages,
  properties,
} from '@omnilease/db';
import type {
  ConversationAutomationState,
  ConversationChannel,
  ConversationStatus,
} from '@omnilease/db';

export type ConversationAutomationAction =
  | 'take_over'
  | 'return_to_ai'
  | 'close'
  | 'convert';

type ScopedConversation = {
  id: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  automationState: ConversationAutomationState;
  assignedAgentId: string | null;
};

export class ConversationActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversationActionError';
  }
}

export function allowsAiReply(input: {
  status: ConversationStatus;
  automationState: ConversationAutomationState;
}): boolean {
  return input.automationState === 'ai_active'
    && input.status !== 'closed'
    && input.status !== 'converted';
}

export async function getConversationAiGate(conversationId: string): Promise<{
  status: ConversationStatus;
  automationState: ConversationAutomationState;
  allowed: boolean;
} | null> {
  const [conversation] = await db
    .select({
      status: conversations.status,
      automationState: conversations.automationState,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) return null;
  return {
    ...conversation,
    allowed: allowsAiReply(conversation),
  };
}

export async function sendHumanReplyForOrg(input: {
  orgId: string;
  userId: string | null;
  conversationId: string;
  content: string;
}): Promise<void> {
  const content = input.content.trim();
  if (!content) {
    throw new ConversationActionError('Reply content is required');
  }

  const conversation = await getScopedConversation(input.orgId, input.conversationId);
  assertConversationCanBeUpdated(conversation);

  await db.insert(messages).values({
    conversationId: conversation.id,
    role: 'assistant',
    authorType: 'human_agent',
    content,
    channel: conversation.channel,
    metadata: input.userId
      ? { source: 'dashboard_reply', userId: input.userId }
      : { source: 'dashboard_reply' },
  });

  await db
    .update(conversations)
    .set({
      status: conversation.status === 'active' ? 'escalated' : conversation.status,
      automationState: 'human_takeover',
      assignedAgentId: input.userId,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id));
}

export async function setConversationAutomationForOrg(input: {
  orgId: string;
  userId: string | null;
  conversationId: string;
  action: ConversationAutomationAction;
}): Promise<void> {
  const conversation = await getScopedConversation(input.orgId, input.conversationId);

  if (input.action === 'return_to_ai') {
    assertConversationCanBeUpdated(conversation);
    await db
      .update(conversations)
      .set({
        status: 'active',
        automationState: 'ai_active',
        assignedAgentId: null,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id));
    return;
  }

  if (input.action === 'take_over') {
    assertConversationCanBeUpdated(conversation);
    await db
      .update(conversations)
      .set({
        status: conversation.status === 'active' ? 'escalated' : conversation.status,
        automationState: 'human_takeover',
        assignedAgentId: input.userId,
        escalatedAt: conversation.status === 'active' ? new Date() : undefined,
        escalationReason: conversation.status === 'active'
          ? 'Manual human takeover'
          : undefined,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id));
    return;
  }

  const terminalStatus: ConversationStatus = input.action === 'convert'
    ? 'converted'
    : 'closed';

  await db
    .update(conversations)
    .set({
      status: terminalStatus,
      automationState: 'human_takeover',
      assignedAgentId: input.userId,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id));
}

async function getScopedConversation(
  orgId: string,
  conversationId: string,
): Promise<ScopedConversation> {
  const [conversation] = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      status: conversations.status,
      automationState: conversations.automationState,
      assignedAgentId: conversations.assignedAgentId,
    })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .where(and(eq(conversations.id, conversationId), eq(properties.orgId, orgId)))
    .limit(1);

  if (!conversation) {
    throw new ConversationActionError('Conversation not found');
  }

  return conversation;
}

function assertConversationCanBeUpdated(conversation: ScopedConversation): void {
  if (conversation.status === 'closed') {
    throw new ConversationActionError('Conversation is closed');
  }
  if (conversation.status === 'converted') {
    throw new ConversationActionError('Conversation is converted');
  }
}
