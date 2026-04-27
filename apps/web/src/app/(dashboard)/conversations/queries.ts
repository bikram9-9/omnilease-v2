import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  isNull,
  properties,
  conversations,
  tourBookings,
  tourOwners,
  messages,
  escalations,
  users,
} from '@omnilease/db';
import type { ConversationMessage } from '@/components/conversations/message-list';

export type ConversationListItem = {
  id: string;
  guestCardId: string | null;
  status: typeof conversations.$inferSelect.status;
  automationState: typeof conversations.$inferSelect.automationState;
  channel: typeof conversations.$inferSelect.channel;
  externalId: string;
  prospectName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  createdAt: Date;
  escalatedAt: Date | null;
  assignedAgentName: string | null;
  propertyName: string;
  propertySlug: string;
  latestMessage: {
    content: string;
    createdAt: Date;
    authorType: typeof messages.$inferSelect.authorType;
  } | null;
  openEscalation: {
    reason: string;
    priority: typeof escalations.$inferSelect.priority;
    createdAt: Date;
  } | null;
};

export type ConversationDetail = {
  id: string;
  guestCardId: string | null;
  status: typeof conversations.$inferSelect.status;
  automationState: typeof conversations.$inferSelect.automationState;
  channel: typeof conversations.$inferSelect.channel;
  externalId: string;
  prospectName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  moveInDate: string | null;
  unitPreference: string | null;
  escalationReason: string | null;
  answerQualityReview: {
    category?: string;
    reason?: string;
    confidence?: number;
    routedToHuman?: boolean;
    reviewedAt?: string;
  } | null;
  createdAt: Date;
  escalatedAt: Date | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  propertyName: string;
  propertySlug: string;
  currentTour: {
    id: string;
    status: typeof tourBookings.$inferSelect.status;
    startAt: Date;
    endAt: Date;
    timezone: string;
    ownerName: string | null;
    ownerAssignmentStatus: typeof tourBookings.$inferSelect.ownerAssignmentStatus;
    ownerAssignmentReason: string | null;
  } | null;
};

export type ConversationEscalation = {
  id: string;
  reason: string;
  priority: typeof escalations.$inferSelect.priority;
  createdAt: Date;
  resolvedAt: Date | null;
};

export async function listConversationsForOrg(orgId: string): Promise<ConversationListItem[]> {
  const rows = await db
    .select({
      id: conversations.id,
      guestCardId: conversations.guestCardId,
      status: conversations.status,
      automationState: conversations.automationState,
      channel: conversations.channel,
      externalId: conversations.externalId,
      prospectName: conversations.prospectName,
      prospectEmail: conversations.prospectEmail,
      prospectPhone: conversations.prospectPhone,
      createdAt: conversations.createdAt,
      escalatedAt: conversations.escalatedAt,
      assignedAgentName: users.name,
      propertyName: properties.name,
      propertySlug: properties.slug,
    })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .leftJoin(users, eq(users.id, conversations.assignedAgentId))
    .where(eq(properties.orgId, orgId));

  if (rows.length === 0) return [];

  const latestMessages = await db
    .select({
      conversationId: messages.conversationId,
      content: messages.content,
      createdAt: messages.createdAt,
      authorType: messages.authorType,
    })
    .from(messages)
    .where(inArray(messages.conversationId, rows.map((row) => row.id)))
    .orderBy(desc(messages.createdAt));

  const latestMessageByConversation = new Map<string, ConversationListItem['latestMessage']>();
  for (const row of latestMessages) {
    if (!latestMessageByConversation.has(row.conversationId)) {
      latestMessageByConversation.set(row.conversationId, {
        content: row.content,
        createdAt: row.createdAt,
        authorType: row.authorType,
      });
    }
  }

  const openEscalationRows = await db
    .select({
      conversationId: escalations.conversationId,
      reason: escalations.reason,
      priority: escalations.priority,
      createdAt: escalations.createdAt,
    })
    .from(escalations)
    .where(and(
      inArray(escalations.conversationId, rows.map((row) => row.id)),
      isNull(escalations.resolvedAt),
    ))
    .orderBy(desc(escalations.createdAt));

  const openEscalationByConversation = new Map<string, ConversationListItem['openEscalation']>();
  for (const row of openEscalationRows) {
    if (!openEscalationByConversation.has(row.conversationId)) {
      openEscalationByConversation.set(row.conversationId, {
        reason: row.reason,
        priority: row.priority,
        createdAt: row.createdAt,
      });
    }
  }

  return rows
    .map((row) => ({
      ...row,
      latestMessage: latestMessageByConversation.get(row.id) ?? null,
      openEscalation: openEscalationByConversation.get(row.id) ?? null,
    }))
    .sort((left, right) => {
      if (left.status === 'escalated' && right.status !== 'escalated') return -1;
      if (right.status === 'escalated' && left.status !== 'escalated') return 1;

      const leftTime = left.latestMessage?.createdAt ?? left.createdAt;
      const rightTime = right.latestMessage?.createdAt ?? right.createdAt;
      return rightTime.getTime() - leftTime.getTime();
    });
}

export async function getConversationDetailForOrg(
  orgId: string,
  conversationId: string,
): Promise<{
  conversation: ConversationDetail | null;
  messages: ConversationMessage[];
  escalations: ConversationEscalation[];
}> {
  const [conversation] = await db
    .select({
      id: conversations.id,
      guestCardId: conversations.guestCardId,
      status: conversations.status,
      automationState: conversations.automationState,
      channel: conversations.channel,
      externalId: conversations.externalId,
      prospectName: conversations.prospectName,
      prospectEmail: conversations.prospectEmail,
      prospectPhone: conversations.prospectPhone,
      moveInDate: conversations.moveInDate,
      unitPreference: conversations.unitPreference,
      escalationReason: conversations.escalationReason,
      metadata: conversations.metadata,
      createdAt: conversations.createdAt,
      escalatedAt: conversations.escalatedAt,
      assignedAgentId: conversations.assignedAgentId,
      assignedAgentName: users.name,
      propertyName: properties.name,
      propertySlug: properties.slug,
    })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .leftJoin(users, eq(users.id, conversations.assignedAgentId))
    .where(and(eq(conversations.id, conversationId), eq(properties.orgId, orgId)))
    .limit(1);

  if (!conversation) {
    return { conversation: null, messages: [], escalations: [] };
  }

  const [messageRows, escalationRows, tourRows] = await Promise.all([
    db
      .select({
        id: messages.id,
        role: messages.role,
        authorType: messages.authorType,
        content: messages.content,
        channel: messages.channel,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt)),
    db
      .select({
        id: escalations.id,
        reason: escalations.reason,
        priority: escalations.priority,
        createdAt: escalations.createdAt,
        resolvedAt: escalations.resolvedAt,
      })
      .from(escalations)
      .where(eq(escalations.conversationId, conversationId))
      .orderBy(desc(escalations.createdAt)),
    db
      .select({
        id: tourBookings.id,
        status: tourBookings.status,
        startAt: tourBookings.startAt,
        endAt: tourBookings.endAt,
        timezone: tourBookings.timezone,
        ownerName: tourOwners.displayName,
        ownerAssignmentStatus: tourBookings.ownerAssignmentStatus,
        ownerAssignmentReason: tourBookings.ownerAssignmentReason,
      })
      .from(tourBookings)
      .leftJoin(tourOwners, eq(tourOwners.id, tourBookings.tourOwnerId))
      .where(eq(tourBookings.conversationId, conversationId))
      .orderBy(desc(tourBookings.startAt))
      .limit(1),
  ]);

  return {
    conversation: {
      ...conversation,
      answerQualityReview: getAnswerQualityReview(conversation.metadata),
      currentTour: tourRows[0] ?? null,
    },
    messages: messageRows.map((row) => ({
      id: row.id,
      role: row.role,
      authorType: row.authorType,
      content: row.content,
      channel: row.channel,
      createdAt: row.createdAt.toISOString(),
    })),
    escalations: escalationRows,
  };
}

function getAnswerQualityReview(metadata: unknown): ConversationDetail['answerQualityReview'] {
  if (!metadata || typeof metadata !== 'object') return null;
  const review = (metadata as { lastAnswerQualityReview?: unknown }).lastAnswerQualityReview;
  if (!review || typeof review !== 'object') return null;
  const value = review as Record<string, unknown>;

  return {
    category: typeof value.category === 'string' ? value.category : undefined,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    confidence: typeof value.confidence === 'number' ? value.confidence : undefined,
    routedToHuman: typeof value.routedToHuman === 'boolean' ? value.routedToHuman : undefined,
    reviewedAt: typeof value.reviewedAt === 'string' ? value.reviewedAt : undefined,
  };
}
