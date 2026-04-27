import {
  and,
  conversations,
  db,
  eq,
  guestCardActivities,
  guestCards,
  inArray,
  tourNotificationJobs,
} from '@omnilease/db';

export async function persistConversationOptOut(input: {
  conversationId: string;
  propertyId: string;
  reason: string;
  now?: Date;
}): Promise<{ guestCardId: string | null; suppressedJobs: number }> {
  const now = input.now ?? new Date();
  const [conversation] = await db
    .select({
      guestCardId: conversations.guestCardId,
    })
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.propertyId, input.propertyId)))
    .limit(1);

  if (!conversation?.guestCardId) {
    return { guestCardId: null, suppressedJobs: 0 };
  }

  await db
    .update(guestCards)
    .set({
      emailConsentStatus: 'opted_out',
      smsConsentStatus: 'opted_out',
      marketingConsentStatus: 'opted_out',
      updatedAt: now,
      lastSeenAt: now,
    })
    .where(eq(guestCards.id, conversation.guestCardId));

  const pendingJobs = await db
    .select({ id: tourNotificationJobs.id })
    .from(tourNotificationJobs)
    .where(and(
      eq(tourNotificationJobs.guestCardId, conversation.guestCardId),
      inArray(tourNotificationJobs.status, ['pending', 'failed']),
    ));

  if (pendingJobs.length > 0) {
    await db
      .update(tourNotificationJobs)
      .set({
        status: 'suppressed',
        sentAt: null,
        lastError: input.reason,
        updatedAt: now,
      })
      .where(inArray(tourNotificationJobs.id, pendingJobs.map((job) => job.id)));
  }

  await db.insert(guestCardActivities).values({
    guestCardId: conversation.guestCardId,
    propertyId: input.propertyId,
    conversationId: input.conversationId,
    eventType: 'task',
    title: 'Prospect opted out of automated outreach',
    description: input.reason,
    metadata: {
      status: 'suppressed',
      suppressedJobCount: pendingJobs.length,
    },
    occurredAt: now,
  });

  return { guestCardId: conversation.guestCardId, suppressedJobs: pendingJobs.length };
}
