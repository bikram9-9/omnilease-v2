import {
  and,
  asc,
  db,
  desc,
  eq,
  guestCardActivities,
  guestCardDuplicateCandidates,
  guestCardMergeAudits,
  guestCardPropertyLinks,
  guestCards,
  inArray,
  not,
  or,
  properties,
  sql,
  conversations,
} from '@omnilease/db';
import type { GuestCard, GuestCardActivityType } from '@omnilease/db';
import {
  buildGuestCardIdentity,
  compareGuestCardIdentity,
} from './identity';

type SyncGuestCardInput = {
  conversationId: string;
  propertyId: string;
  channel: string;
  externalId: string;
  source: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  moveInDate?: string | null;
  unitPreference?: string | null;
  metadata?: Record<string, unknown>;
};

type MergeGuestCardsInput = {
  orgId: string;
  sourceGuestCardId: string;
  targetGuestCardId: string;
  userId: string | null;
  duplicateCandidateId?: string | null;
};

type RevertGuestCardMergeInput = {
  orgId: string;
  mergeAuditId: string;
  userId: string | null;
};

type GuestCardSnapshot = {
  guestCard: GuestCard;
  conversationIds: string[];
  activityIds: string[];
  propertyLinks: Array<typeof guestCardPropertyLinks.$inferSelect>;
};
type QueryClient = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

const DUPLICATE_CONFIDENCE_THRESHOLD = 0.58;

export async function syncGuestCardForConversation(input: SyncGuestCardInput): Promise<{ guestCardId: string }> {
  const [property] = await db
    .select({
      id: properties.id,
      orgId: properties.orgId,
      name: properties.name,
    })
    .from(properties)
    .where(eq(properties.id, input.propertyId))
    .limit(1);

  if (!property) {
    throw new Error('Property not found for guest card sync');
  }

  const [conversation] = await db
    .select({
      id: conversations.id,
      guestCardId: conversations.guestCardId,
      prospectName: conversations.prospectName,
      prospectEmail: conversations.prospectEmail,
      prospectPhone: conversations.prospectPhone,
      moveInDate: conversations.moveInDate,
      unitPreference: conversations.unitPreference,
    })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);

  if (!conversation) {
    throw new Error('Conversation not found for guest card sync');
  }

  const identity = buildGuestCardIdentity({
    name: input.name ?? conversation.prospectName,
    email: input.email ?? conversation.prospectEmail,
    phone: input.phone ?? conversation.prospectPhone,
    externalId: input.externalId,
    channel: input.channel,
  });

  const moveInDate = input.moveInDate ?? conversation.moveInDate ?? null;
  const unitPreference = input.unitPreference ?? conversation.unitPreference ?? null;
  const now = new Date();

  let guestCard = conversation.guestCardId
    ? await getActiveGuestCardForOrg(property.orgId, conversation.guestCardId)
    : null;

  if (!guestCard) {
    guestCard = await findReusableGuestCard(property.orgId, identity);
  }

  if (!guestCard) {
    const [created] = await db
      .insert(guestCards)
      .values({
        orgId: property.orgId,
        primaryPropertyId: property.id,
        source: input.source,
        firstChannel: input.channel,
        fullName: identity.fullName,
        email: identity.email,
        phone: identity.phone,
        normalizedName: identity.normalizedName,
        normalizedEmail: identity.normalizedEmail,
        normalizedPhone: identity.normalizedPhone,
        moveInDate,
        unitPreference,
        externalIds: identity.externalIds,
        metadata: input.metadata ?? {},
        lastSeenAt: now,
      })
      .returning();
    guestCard = created;
  } else {
    const mergedExternalIds = {
      ...(guestCard.externalIds ?? {}),
      ...identity.externalIds,
    };
    const [updated] = await db
      .update(guestCards)
      .set({
        fullName: identity.fullName ?? guestCard.fullName,
        email: identity.email ?? guestCard.email,
        phone: identity.phone ?? guestCard.phone,
        normalizedName: identity.normalizedName ?? guestCard.normalizedName,
        normalizedEmail: identity.normalizedEmail ?? guestCard.normalizedEmail,
        normalizedPhone: identity.normalizedPhone ?? guestCard.normalizedPhone,
        moveInDate: moveInDate ?? guestCard.moveInDate,
        unitPreference: unitPreference ?? guestCard.unitPreference,
        externalIds: mergedExternalIds,
        primaryPropertyId: guestCard.primaryPropertyId ?? property.id,
        metadata: {
          ...(guestCard.metadata ?? {}),
          ...(input.metadata ?? {}),
        },
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(guestCards.id, guestCard.id))
      .returning();
    guestCard = updated;
  }

  if (conversation.guestCardId !== guestCard.id) {
    await db
      .update(conversations)
      .set({ guestCardId: guestCard.id, updatedAt: now })
      .where(eq(conversations.id, input.conversationId));
  }

  await linkGuestCardToProperty(guestCard.id, property.id, input.source, now);
  await ensureConversationActivity({
    guestCardId: guestCard.id,
    propertyId: property.id,
    conversationId: input.conversationId,
    title: `${property.name} ${input.channel} conversation`,
    metadata: {
      channel: input.channel,
      source: input.source,
      externalId: input.externalId,
    },
  });
  await flagDuplicateCandidates(property.orgId, guestCard);

  return { guestCardId: guestCard.id };
}

export async function mergeGuestCardsForOrg(input: MergeGuestCardsInput): Promise<{ mergeAuditId: string }> {
  if (input.sourceGuestCardId === input.targetGuestCardId) {
    throw new Error('Choose two different guest cards to merge');
  }

  return db.transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx
        .select()
        .from(guestCards)
        .where(and(eq(guestCards.id, input.sourceGuestCardId), eq(guestCards.orgId, input.orgId)))
        .limit(1),
      tx
        .select()
        .from(guestCards)
        .where(and(eq(guestCards.id, input.targetGuestCardId), eq(guestCards.orgId, input.orgId)))
        .limit(1),
    ]);

    if (!source[0] || !target[0]) {
      throw new Error('Guest card not found in this organization');
    }
    if (source[0].status !== 'active' || target[0].status !== 'active') {
      throw new Error('Only active guest cards can be merged');
    }

    const [sourceSnapshot, targetSnapshot] = await Promise.all([
      buildSnapshot(tx, source[0]),
      buildSnapshot(tx, target[0]),
    ]);

    const now = new Date();
    await tx
      .update(guestCards)
      .set({
        fullName: target[0].fullName ?? source[0].fullName,
        email: target[0].email ?? source[0].email,
        phone: target[0].phone ?? source[0].phone,
        normalizedName: target[0].normalizedName ?? source[0].normalizedName,
        normalizedEmail: target[0].normalizedEmail ?? source[0].normalizedEmail,
        normalizedPhone: target[0].normalizedPhone ?? source[0].normalizedPhone,
        moveInDate: target[0].moveInDate ?? source[0].moveInDate,
        unitPreference: target[0].unitPreference ?? source[0].unitPreference,
        externalIds: {
          ...(source[0].externalIds ?? {}),
          ...(target[0].externalIds ?? {}),
        },
        metadata: {
          ...(source[0].metadata ?? {}),
          ...(target[0].metadata ?? {}),
          mergedGuestCardIds: [
            ...new Set([
              ...metadataList(source[0].metadata?.mergedGuestCardIds),
              ...metadataList(target[0].metadata?.mergedGuestCardIds),
              source[0].id,
            ]),
          ],
        },
        lastSeenAt: newerDate(source[0].lastSeenAt, target[0].lastSeenAt),
        updatedAt: now,
      })
      .where(eq(guestCards.id, target[0].id));

    await tx
      .update(guestCards)
      .set({
        status: 'merged',
        mergedIntoGuestCardId: target[0].id,
        updatedAt: now,
      })
      .where(eq(guestCards.id, source[0].id));

    await tx
      .update(conversations)
      .set({ guestCardId: target[0].id, updatedAt: now })
      .where(eq(conversations.guestCardId, source[0].id));

    await tx
      .update(guestCardActivities)
      .set({ guestCardId: target[0].id })
      .where(eq(guestCardActivities.guestCardId, source[0].id));

    for (const link of sourceSnapshot.propertyLinks) {
      await tx
        .insert(guestCardPropertyLinks)
        .values({
          guestCardId: target[0].id,
          propertyId: link.propertyId,
          source: link.source,
          firstSeenAt: link.firstSeenAt,
          lastSeenAt: link.lastSeenAt,
        })
        .onConflictDoUpdate({
          target: [guestCardPropertyLinks.guestCardId, guestCardPropertyLinks.propertyId],
          set: { lastSeenAt: link.lastSeenAt },
        });
    }

    const [audit] = await tx
      .insert(guestCardMergeAudits)
      .values({
        orgId: input.orgId,
        sourceGuestCardId: source[0].id,
        targetGuestCardId: target[0].id,
        duplicateCandidateId: input.duplicateCandidateId ?? null,
        mergedBy: input.userId,
        sourceSnapshot: sourceSnapshot as unknown as Record<string, unknown>,
        targetSnapshot: targetSnapshot as unknown as Record<string, unknown>,
      })
      .returning({ id: guestCardMergeAudits.id });

    await tx.insert(guestCardActivities).values({
      guestCardId: target[0].id,
      propertyId: target[0].primaryPropertyId,
      eventType: 'merge',
      title: 'Guest cards merged',
      description: `Merged ${source[0].fullName ?? source[0].email ?? source[0].id} into this guest card.`,
      metadata: {
        sourceGuestCardId: source[0].id,
        mergeAuditId: audit.id,
      },
      occurredAt: now,
    });

    await markDuplicateCandidateMerged(tx, input.orgId, target[0].id, source[0].id, input.userId, now);

    return { mergeAuditId: audit.id };
  });
}

export async function revertGuestCardMergeForOrg(input: RevertGuestCardMergeInput): Promise<void> {
  await db.transaction(async (tx) => {
    const [audit] = await tx
      .select()
      .from(guestCardMergeAudits)
      .where(and(eq(guestCardMergeAudits.id, input.mergeAuditId), eq(guestCardMergeAudits.orgId, input.orgId)))
      .limit(1);

    if (!audit || audit.revertedAt || !audit.reversible) {
      throw new Error('Merge audit cannot be reverted');
    }

    const sourceSnapshot = audit.sourceSnapshot as unknown as GuestCardSnapshot;
    const targetSnapshot = audit.targetSnapshot as unknown as GuestCardSnapshot;
    const now = new Date();

    await tx
      .update(guestCards)
      .set(toGuestCardUpdate(sourceSnapshot.guestCard))
      .where(eq(guestCards.id, sourceSnapshot.guestCard.id));

    await tx
      .update(guestCards)
      .set(toGuestCardUpdate(targetSnapshot.guestCard))
      .where(eq(guestCards.id, targetSnapshot.guestCard.id));

    if (sourceSnapshot.conversationIds.length > 0) {
      await tx
        .update(conversations)
        .set({ guestCardId: sourceSnapshot.guestCard.id, updatedAt: now })
        .where(inArray(conversations.id, sourceSnapshot.conversationIds));
    }

    if (sourceSnapshot.activityIds.length > 0) {
      await tx
        .update(guestCardActivities)
        .set({ guestCardId: sourceSnapshot.guestCard.id })
        .where(inArray(guestCardActivities.id, sourceSnapshot.activityIds));
    }

    await restorePropertyLinks(tx, sourceSnapshot);
    await restorePropertyLinks(tx, targetSnapshot);

    if (audit.duplicateCandidateId) {
      await tx
        .update(guestCardDuplicateCandidates)
        .set({ status: 'open', resolvedAt: null, resolvedBy: null })
        .where(eq(guestCardDuplicateCandidates.id, audit.duplicateCandidateId));
    }

    await tx
      .update(guestCardMergeAudits)
      .set({ revertedAt: now, revertedBy: input.userId })
      .where(eq(guestCardMergeAudits.id, audit.id));
  });
}

async function restorePropertyLinks(tx: QueryClient, snapshot: GuestCardSnapshot): Promise<void> {
  const linkIds = snapshot.propertyLinks.map((link) => link.id);
  const deleteWhere = linkIds.length > 0
    ? and(
      eq(guestCardPropertyLinks.guestCardId, snapshot.guestCard.id),
      not(inArray(guestCardPropertyLinks.id, linkIds)),
    )
    : eq(guestCardPropertyLinks.guestCardId, snapshot.guestCard.id);

  await tx.delete(guestCardPropertyLinks).where(deleteWhere);

  for (const link of snapshot.propertyLinks) {
    await tx
      .insert(guestCardPropertyLinks)
      .values({
        id: link.id,
        guestCardId: snapshot.guestCard.id,
        propertyId: link.propertyId,
        source: link.source,
        firstSeenAt: asDate(link.firstSeenAt),
        lastSeenAt: asDate(link.lastSeenAt),
      })
      .onConflictDoUpdate({
        target: [guestCardPropertyLinks.guestCardId, guestCardPropertyLinks.propertyId],
        set: {
          source: link.source,
          firstSeenAt: asDate(link.firstSeenAt),
          lastSeenAt: asDate(link.lastSeenAt),
        },
      });
  }
}

async function getActiveGuestCardForOrg(orgId: string, guestCardId: string): Promise<GuestCard | null> {
  const [card] = await db
    .select()
    .from(guestCards)
    .where(and(eq(guestCards.id, guestCardId), eq(guestCards.orgId, orgId), eq(guestCards.status, 'active')))
    .limit(1);
  return card ?? null;
}

async function findReusableGuestCard(
  orgId: string,
  identity: ReturnType<typeof buildGuestCardIdentity>,
): Promise<GuestCard | null> {
  const conditions = [
    identity.normalizedEmail ? eq(guestCards.normalizedEmail, identity.normalizedEmail) : null,
    identity.normalizedPhone ? eq(guestCards.normalizedPhone, identity.normalizedPhone) : null,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

  if (conditions.length === 0) return null;
  const identityWhere = conditions.length === 1 ? conditions[0] : or(...conditions);

  const [card] = await db
    .select()
    .from(guestCards)
    .where(and(eq(guestCards.orgId, orgId), eq(guestCards.status, 'active'), identityWhere))
    .orderBy(desc(guestCards.lastSeenAt))
    .limit(1);

  return card ?? null;
}

async function linkGuestCardToProperty(
  guestCardId: string,
  propertyId: string,
  source: string,
  lastSeenAt: Date,
): Promise<void> {
  await db
    .insert(guestCardPropertyLinks)
    .values({
      guestCardId,
      propertyId,
      source,
      lastSeenAt,
    })
    .onConflictDoUpdate({
      target: [guestCardPropertyLinks.guestCardId, guestCardPropertyLinks.propertyId],
      set: { source, lastSeenAt },
    });
}

async function ensureConversationActivity(input: {
  guestCardId: string;
  propertyId: string;
  conversationId: string;
  title: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const [existing] = await db
    .select({ id: guestCardActivities.id })
    .from(guestCardActivities)
    .where(
      and(
        eq(guestCardActivities.guestCardId, input.guestCardId),
        eq(guestCardActivities.conversationId, input.conversationId),
        eq(guestCardActivities.eventType, 'conversation'),
      ),
    )
    .limit(1);

  if (existing) return;

  await db.insert(guestCardActivities).values({
    guestCardId: input.guestCardId,
    propertyId: input.propertyId,
    conversationId: input.conversationId,
    eventType: 'conversation',
    title: input.title,
    metadata: input.metadata,
  });
}

async function flagDuplicateCandidates(orgId: string, card: GuestCard): Promise<void> {
  const candidates = await db
    .select()
    .from(guestCards)
    .where(
      and(
        eq(guestCards.orgId, orgId),
        eq(guestCards.status, 'active'),
        sql`${guestCards.id} <> ${card.id}`,
      ),
    )
    .orderBy(desc(guestCards.lastSeenAt));

  for (const candidate of candidates) {
    const match = compareGuestCardIdentity(card, candidate);
    if (match.confidence < DUPLICATE_CONFIDENCE_THRESHOLD) continue;

    const [primaryGuestCardId, duplicateGuestCardId] = orderedPair(card.id, candidate.id);
    await db
      .insert(guestCardDuplicateCandidates)
      .values({
        orgId,
        primaryGuestCardId,
        duplicateGuestCardId,
        confidence: match.confidence.toFixed(2),
        matchReasons: match.reasons,
      })
      .onConflictDoUpdate({
        target: [
          guestCardDuplicateCandidates.primaryGuestCardId,
          guestCardDuplicateCandidates.duplicateGuestCardId,
        ],
        set: {
          status: 'open',
          confidence: match.confidence.toFixed(2),
          matchReasons: match.reasons,
          resolvedAt: null,
          resolvedBy: null,
        },
      });
  }
}

async function buildSnapshot(tx: QueryClient, guestCard: GuestCard): Promise<GuestCardSnapshot> {
  const [conversationRows, activityRows, propertyLinks] = await Promise.all([
    tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.guestCardId, guestCard.id))
      .orderBy(asc(conversations.createdAt)),
    tx
      .select({ id: guestCardActivities.id })
      .from(guestCardActivities)
      .where(eq(guestCardActivities.guestCardId, guestCard.id))
      .orderBy(asc(guestCardActivities.occurredAt)),
    tx
      .select()
      .from(guestCardPropertyLinks)
      .where(eq(guestCardPropertyLinks.guestCardId, guestCard.id))
      .orderBy(asc(guestCardPropertyLinks.firstSeenAt)),
  ]);

  return {
    guestCard,
    conversationIds: conversationRows.map((row) => row.id),
    activityIds: activityRows.map((row) => row.id),
    propertyLinks,
  };
}

async function markDuplicateCandidateMerged(
  tx: QueryClient,
  orgId: string,
  targetGuestCardId: string,
  sourceGuestCardId: string,
  userId: string | null,
  resolvedAt: Date,
): Promise<void> {
  const [primaryGuestCardId, duplicateGuestCardId] = orderedPair(targetGuestCardId, sourceGuestCardId);
  await tx
    .update(guestCardDuplicateCandidates)
    .set({ status: 'merged', resolvedAt, resolvedBy: userId })
    .where(
      and(
        eq(guestCardDuplicateCandidates.orgId, orgId),
        eq(guestCardDuplicateCandidates.primaryGuestCardId, primaryGuestCardId),
        eq(guestCardDuplicateCandidates.duplicateGuestCardId, duplicateGuestCardId),
      ),
    );
}

function orderedPair(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

function newerDate(left: Date, right: Date): Date {
  return left.getTime() > right.getTime() ? left : right;
}

function metadataList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toGuestCardUpdate(guestCard: GuestCard) {
  return {
    primaryPropertyId: guestCard.primaryPropertyId,
    ownerUserId: guestCard.ownerUserId,
    status: guestCard.status,
    stage: guestCard.stage,
    source: guestCard.source,
    firstChannel: guestCard.firstChannel,
    fullName: guestCard.fullName,
    email: guestCard.email,
    phone: guestCard.phone,
    normalizedEmail: guestCard.normalizedEmail,
    normalizedPhone: guestCard.normalizedPhone,
    normalizedName: guestCard.normalizedName,
    moveInDate: guestCard.moveInDate,
    unitPreference: guestCard.unitPreference,
    externalIds: guestCard.externalIds,
    notes: guestCard.notes,
    metadata: guestCard.metadata,
    mergedIntoGuestCardId: guestCard.mergedIntoGuestCardId,
    firstSeenAt: asDate(guestCard.firstSeenAt),
    lastSeenAt: asDate(guestCard.lastSeenAt),
    updatedAt: new Date(),
  };
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export async function createGuestCardActivity(input: {
  guestCardId: string;
  propertyId?: string | null;
  conversationId?: string | null;
  eventType: GuestCardActivityType;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}): Promise<void> {
  await db.insert(guestCardActivities).values({
    guestCardId: input.guestCardId,
    propertyId: input.propertyId ?? null,
    conversationId: input.conversationId ?? null,
    eventType: input.eventType,
    title: input.title,
    description: input.description ?? null,
    metadata: input.metadata ?? {},
    occurredAt: input.occurredAt ?? new Date(),
  });
}

export async function getGuestCardExportInput(orgId: string, guestCardId: string) {
  const [guestCard] = await db
    .select()
    .from(guestCards)
    .where(and(eq(guestCards.id, guestCardId), eq(guestCards.orgId, orgId)))
    .limit(1);

  if (!guestCard) return null;

  const [propertyLinks, conversationRows, activityRows] = await Promise.all([
    db
      .select({
        id: properties.id,
        name: properties.name,
        slug: properties.slug,
      })
      .from(guestCardPropertyLinks)
      .innerJoin(properties, eq(properties.id, guestCardPropertyLinks.propertyId))
      .where(eq(guestCardPropertyLinks.guestCardId, guestCard.id)),
    db
      .select({
        id: conversations.id,
        propertyId: conversations.propertyId,
        channel: conversations.channel,
        status: conversations.status,
        externalId: conversations.externalId,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(eq(conversations.guestCardId, guestCard.id))
      .orderBy(desc(conversations.updatedAt)),
    db
      .select({
        id: guestCardActivities.id,
        eventType: guestCardActivities.eventType,
        title: guestCardActivities.title,
        occurredAt: guestCardActivities.occurredAt,
      })
      .from(guestCardActivities)
      .where(eq(guestCardActivities.guestCardId, guestCard.id))
      .orderBy(desc(guestCardActivities.occurredAt)),
  ]);

  return {
    guestCard,
    properties: propertyLinks,
    conversations: conversationRows,
    activities: activityRows,
  };
}
