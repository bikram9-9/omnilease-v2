import {
  and,
  db,
  desc,
  eq,
  guestCardActivities,
  guestCardDuplicateCandidates,
  guestCardMergeAudits,
  guestCardPropertyLinks,
  guestCards,
  inArray,
  messages,
  or,
  properties,
  tourBookings,
  tourOwners,
  tourNotificationJobs,
  conversations,
} from '@omnilease/db';

export type GuestCardListItem = {
  id: string;
  status: typeof guestCards.$inferSelect.status;
  stage: typeof guestCards.$inferSelect.stage;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  moveInDate: string | null;
  unitPreference: string | null;
  lastSeenAt: Date;
  propertyName: string | null;
  conversationCount: number;
  openDuplicateCount: number;
};

export type GuestCardDetail = typeof guestCards.$inferSelect & {
  primaryPropertyName: string | null;
};

export type GuestCardConversation = {
  id: string;
  propertyId: string;
  propertyName: string;
  channel: typeof conversations.$inferSelect.channel;
  status: typeof conversations.$inferSelect.status;
  externalId: string;
  createdAt: Date;
  updatedAt: Date;
  latestMessage: {
    content: string;
    createdAt: Date;
    authorType: typeof messages.$inferSelect.authorType;
  } | null;
};

export type GuestCardDuplicate = {
  candidateId: string;
  confidence: string;
  matchReasons: string[];
  otherCard: {
    id: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    stage: typeof guestCards.$inferSelect.stage;
    lastSeenAt: Date;
  };
};

export type GuestCardMergeAuditRow = {
  id: string;
  sourceGuestCardId: string;
  targetGuestCardId: string;
  mergedAt: Date;
  revertedAt: Date | null;
  reversible: boolean;
};

export type GuestCardScheduledFollowUp = {
  id: string;
  jobType: typeof tourNotificationJobs.$inferSelect.jobType;
  recipientKind: typeof tourNotificationJobs.$inferSelect.recipientKind;
  channel: typeof tourNotificationJobs.$inferSelect.channel;
  status: typeof tourNotificationJobs.$inferSelect.status;
  runAt: Date;
  nextAttemptAt: Date;
  attempts: number;
  lastError: string | null;
};

export type GuestCardTour = {
  id: string;
  status: typeof tourBookings.$inferSelect.status;
  tourType: typeof tourBookings.$inferSelect.tourType;
  startAt: Date;
  endAt: Date;
  timezone: string;
  ownerName: string | null;
  ownerAssignmentStatus: typeof tourBookings.$inferSelect.ownerAssignmentStatus;
};

export async function listGuestCardsForOrg(orgId: string): Promise<GuestCardListItem[]> {
  const rows = await db
    .select({
      id: guestCards.id,
      status: guestCards.status,
      stage: guestCards.stage,
      fullName: guestCards.fullName,
      email: guestCards.email,
      phone: guestCards.phone,
      moveInDate: guestCards.moveInDate,
      unitPreference: guestCards.unitPreference,
      lastSeenAt: guestCards.lastSeenAt,
      propertyName: properties.name,
    })
    .from(guestCards)
    .leftJoin(properties, eq(properties.id, guestCards.primaryPropertyId))
    .where(and(eq(guestCards.orgId, orgId), eq(guestCards.status, 'active')))
    .orderBy(desc(guestCards.lastSeenAt));

  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [conversationRows, duplicateRows] = await Promise.all([
    db
      .select({ guestCardId: conversations.guestCardId })
      .from(conversations)
      .where(inArray(conversations.guestCardId, ids)),
    db
      .select({
        primaryGuestCardId: guestCardDuplicateCandidates.primaryGuestCardId,
        duplicateGuestCardId: guestCardDuplicateCandidates.duplicateGuestCardId,
      })
      .from(guestCardDuplicateCandidates)
      .where(
        and(
          eq(guestCardDuplicateCandidates.orgId, orgId),
          eq(guestCardDuplicateCandidates.status, 'open'),
          or(
            inArray(guestCardDuplicateCandidates.primaryGuestCardId, ids),
            inArray(guestCardDuplicateCandidates.duplicateGuestCardId, ids),
          ),
        ),
      ),
  ]);

  const conversationCounts = new Map<string, number>();
  for (const row of conversationRows) {
    if (!row.guestCardId) continue;
    conversationCounts.set(row.guestCardId, (conversationCounts.get(row.guestCardId) ?? 0) + 1);
  }

  const duplicateCounts = new Map<string, number>();
  for (const row of duplicateRows) {
    duplicateCounts.set(row.primaryGuestCardId, (duplicateCounts.get(row.primaryGuestCardId) ?? 0) + 1);
    duplicateCounts.set(row.duplicateGuestCardId, (duplicateCounts.get(row.duplicateGuestCardId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    ...row,
    conversationCount: conversationCounts.get(row.id) ?? 0,
    openDuplicateCount: duplicateCounts.get(row.id) ?? 0,
  }));
}

export async function getGuestCardDetailForOrg(
  orgId: string,
  guestCardId: string,
): Promise<{
  guestCard: GuestCardDetail | null;
  properties: Array<{ id: string; name: string; slug: string; source: string; lastSeenAt: Date }>;
  conversations: GuestCardConversation[];
  activities: Array<typeof guestCardActivities.$inferSelect>;
  tours: GuestCardTour[];
  scheduledFollowUps: GuestCardScheduledFollowUp[];
  duplicates: GuestCardDuplicate[];
  mergeAudits: GuestCardMergeAuditRow[];
}> {
  const [guestCard] = await db
    .select({
      id: guestCards.id,
      orgId: guestCards.orgId,
      primaryPropertyId: guestCards.primaryPropertyId,
      ownerUserId: guestCards.ownerUserId,
      status: guestCards.status,
      stage: guestCards.stage,
      source: guestCards.source,
      firstChannel: guestCards.firstChannel,
      fullName: guestCards.fullName,
      email: guestCards.email,
      phone: guestCards.phone,
      normalizedEmail: guestCards.normalizedEmail,
      normalizedPhone: guestCards.normalizedPhone,
      normalizedName: guestCards.normalizedName,
      moveInDate: guestCards.moveInDate,
      unitPreference: guestCards.unitPreference,
      emailConsentStatus: guestCards.emailConsentStatus,
      smsConsentStatus: guestCards.smsConsentStatus,
      marketingConsentStatus: guestCards.marketingConsentStatus,
      externalIds: guestCards.externalIds,
      notes: guestCards.notes,
      metadata: guestCards.metadata,
      mergedIntoGuestCardId: guestCards.mergedIntoGuestCardId,
      firstSeenAt: guestCards.firstSeenAt,
      lastSeenAt: guestCards.lastSeenAt,
      createdAt: guestCards.createdAt,
      updatedAt: guestCards.updatedAt,
      primaryPropertyName: properties.name,
    })
    .from(guestCards)
    .leftJoin(properties, eq(properties.id, guestCards.primaryPropertyId))
    .where(and(eq(guestCards.id, guestCardId), eq(guestCards.orgId, orgId)))
    .limit(1);

  if (!guestCard) {
    return {
      guestCard: null,
      properties: [],
      conversations: [],
      activities: [],
      tours: [],
      scheduledFollowUps: [],
      duplicates: [],
      mergeAudits: [],
    };
  }

  const [
    propertyRows,
    conversationRows,
    activityRows,
    tourRows,
    scheduledFollowUps,
    duplicateRows,
    mergeAudits,
  ] = await Promise.all([
    db
      .select({
        id: properties.id,
        name: properties.name,
        slug: properties.slug,
        source: guestCardPropertyLinks.source,
        lastSeenAt: guestCardPropertyLinks.lastSeenAt,
      })
      .from(guestCardPropertyLinks)
      .innerJoin(properties, eq(properties.id, guestCardPropertyLinks.propertyId))
      .where(eq(guestCardPropertyLinks.guestCardId, guestCard.id))
      .orderBy(desc(guestCardPropertyLinks.lastSeenAt)),
    db
      .select({
        id: conversations.id,
        propertyId: conversations.propertyId,
        propertyName: properties.name,
        channel: conversations.channel,
        status: conversations.status,
        externalId: conversations.externalId,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .innerJoin(properties, eq(properties.id, conversations.propertyId))
      .where(and(eq(conversations.guestCardId, guestCard.id), eq(properties.orgId, orgId)))
      .orderBy(desc(conversations.updatedAt)),
    db
      .select()
      .from(guestCardActivities)
      .where(eq(guestCardActivities.guestCardId, guestCard.id))
      .orderBy(desc(guestCardActivities.occurredAt)),
    db
      .select({
        id: tourBookings.id,
        status: tourBookings.status,
        tourType: tourBookings.tourType,
        startAt: tourBookings.startAt,
        endAt: tourBookings.endAt,
        timezone: tourBookings.timezone,
        ownerName: tourOwners.displayName,
        ownerAssignmentStatus: tourBookings.ownerAssignmentStatus,
      })
      .from(tourBookings)
      .leftJoin(tourOwners, eq(tourOwners.id, tourBookings.tourOwnerId))
      .where(eq(tourBookings.guestCardId, guestCard.id))
      .orderBy(desc(tourBookings.startAt)),
    db
      .select({
        id: tourNotificationJobs.id,
        jobType: tourNotificationJobs.jobType,
        recipientKind: tourNotificationJobs.recipientKind,
        channel: tourNotificationJobs.channel,
        status: tourNotificationJobs.status,
        runAt: tourNotificationJobs.runAt,
        nextAttemptAt: tourNotificationJobs.nextAttemptAt,
        attempts: tourNotificationJobs.attempts,
        lastError: tourNotificationJobs.lastError,
      })
      .from(tourNotificationJobs)
      .where(eq(tourNotificationJobs.guestCardId, guestCard.id))
      .orderBy(desc(tourNotificationJobs.runAt)),
    db
      .select()
      .from(guestCardDuplicateCandidates)
      .where(
        and(
          eq(guestCardDuplicateCandidates.orgId, orgId),
          eq(guestCardDuplicateCandidates.status, 'open'),
          or(
            eq(guestCardDuplicateCandidates.primaryGuestCardId, guestCard.id),
            eq(guestCardDuplicateCandidates.duplicateGuestCardId, guestCard.id),
          ),
        ),
      )
      .orderBy(desc(guestCardDuplicateCandidates.createdAt)),
    db
      .select({
        id: guestCardMergeAudits.id,
        sourceGuestCardId: guestCardMergeAudits.sourceGuestCardId,
        targetGuestCardId: guestCardMergeAudits.targetGuestCardId,
        mergedAt: guestCardMergeAudits.mergedAt,
        revertedAt: guestCardMergeAudits.revertedAt,
        reversible: guestCardMergeAudits.reversible,
      })
      .from(guestCardMergeAudits)
      .where(
        and(
          eq(guestCardMergeAudits.orgId, orgId),
          or(
            eq(guestCardMergeAudits.sourceGuestCardId, guestCard.id),
            eq(guestCardMergeAudits.targetGuestCardId, guestCard.id),
          ),
        ),
      )
      .orderBy(desc(guestCardMergeAudits.mergedAt)),
  ]);

  const latestMessages = conversationRows.length === 0
    ? []
    : await db
      .select({
        conversationId: messages.conversationId,
        content: messages.content,
        createdAt: messages.createdAt,
        authorType: messages.authorType,
      })
      .from(messages)
      .where(inArray(messages.conversationId, conversationRows.map((row) => row.id)))
      .orderBy(desc(messages.createdAt));

  const latestMessageByConversation = new Map<string, GuestCardConversation['latestMessage']>();
  for (const row of latestMessages) {
    if (!latestMessageByConversation.has(row.conversationId)) {
      latestMessageByConversation.set(row.conversationId, {
        content: row.content,
        createdAt: row.createdAt,
        authorType: row.authorType,
      });
    }
  }

  const duplicateIds = duplicateRows.map((row) => (
    row.primaryGuestCardId === guestCard.id ? row.duplicateGuestCardId : row.primaryGuestCardId
  ));
  const duplicateCards = duplicateIds.length === 0
    ? []
    : await db
      .select({
        id: guestCards.id,
        fullName: guestCards.fullName,
        email: guestCards.email,
        phone: guestCards.phone,
        stage: guestCards.stage,
        lastSeenAt: guestCards.lastSeenAt,
      })
      .from(guestCards)
      .where(and(eq(guestCards.orgId, orgId), inArray(guestCards.id, duplicateIds)));
  const duplicateCardById = new Map(duplicateCards.map((row) => [row.id, row]));

  return {
    guestCard,
    properties: propertyRows,
    conversations: conversationRows.map((row) => ({
      ...row,
      latestMessage: latestMessageByConversation.get(row.id) ?? null,
    })),
    activities: activityRows,
    tours: tourRows,
    scheduledFollowUps,
    duplicates: duplicateRows.flatMap((row) => {
      const otherId = row.primaryGuestCardId === guestCard.id ? row.duplicateGuestCardId : row.primaryGuestCardId;
      const otherCard = duplicateCardById.get(otherId);
      if (!otherCard) return [];
      return [{
        candidateId: row.id,
        confidence: row.confidence,
        matchReasons: row.matchReasons,
        otherCard,
      }];
    }),
    mergeAudits,
  };
}

export function getGuestCardDisplayName(card: {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  id: string;
}) {
  return card.fullName ?? card.email ?? card.phone ?? `Guest card ${card.id.slice(0, 8)}`;
}

export function getStageLabel(stage: string) {
  return stage.replace(/_/g, ' ');
}
