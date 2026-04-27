import { afterEach, describe, expect, it } from 'vitest';
import {
  conversations,
  db,
  eq,
  guestCardDuplicateCandidates,
  guestCardMergeAudits,
  guestCards,
  organizations,
  properties,
} from '@omnilease/db';
import {
  mergeGuestCardsForOrg,
  revertGuestCardMergeForOrg,
  syncGuestCardForConversation,
} from '../service';

const TEST_PREFIX = 'guest-card-int-';
const orgIds: string[] = [];

async function seedOrgProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();
  orgIds.push(org.id);

  const [property] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      slug: `${TEST_PREFIX}property-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Guest Card Test Property',
      timezone: 'America/Chicago',
    })
    .returning();

  return { org, property };
}

async function seedConversation(propertyId: string, externalId: string) {
  const [conversation] = await db
    .insert(conversations)
    .values({
      propertyId,
      channel: 'website',
      externalId,
      status: 'active',
    })
    .returning();
  return conversation;
}

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => db.delete(organizations).where(eq(organizations.id, orgId))));
});

describe('guest card service integration', () => {
  it('reuses existing guest cards for exact contact matches', async () => {
    const { property } = await seedOrgProperty();
    const firstConversation = await seedConversation(property.id, 'sess_exact_1');
    const secondConversation = await seedConversation(property.id, 'sess_exact_2');

    const first = await syncGuestCardForConversation({
      conversationId: firstConversation.id,
      propertyId: property.id,
      channel: 'website',
      externalId: 'sess_exact_1',
      source: 'test',
      name: 'Avery Stone',
      email: 'avery@example.com',
    });

    const second = await syncGuestCardForConversation({
      conversationId: secondConversation.id,
      propertyId: property.id,
      channel: 'website',
      externalId: 'sess_exact_2',
      source: 'test',
      email: 'AVERY@example.com',
    });

    expect(second.guestCardId).toBe(first.guestCardId);

    const linked = await db
      .select()
      .from(conversations)
      .where(eq(conversations.guestCardId, first.guestCardId));
    expect(linked).toHaveLength(2);
  });

  it('flags fuzzy duplicates, merges with an audit snapshot, and reverts the merge', async () => {
    const { org, property } = await seedOrgProperty();
    const firstConversation = await seedConversation(property.id, 'sess_merge_1');
    const secondConversation = await seedConversation(property.id, 'sess_merge_2');

    const first = await syncGuestCardForConversation({
      conversationId: firstConversation.id,
      propertyId: property.id,
      channel: 'website',
      externalId: 'sess_merge_1',
      source: 'test',
      name: 'Jordan Lee',
      phone: '512-555-0101',
    });

    const second = await syncGuestCardForConversation({
      conversationId: secondConversation.id,
      propertyId: property.id,
      channel: 'website',
      externalId: 'sess_merge_2',
      source: 'test',
      name: 'Jordan Lee',
      phone: '512-555-0202',
    });

    expect(second.guestCardId).not.toBe(first.guestCardId);

    const [candidate] = await db
      .select()
      .from(guestCardDuplicateCandidates)
      .where(eq(guestCardDuplicateCandidates.orgId, org.id));
    expect(candidate.status).toBe('open');
    expect(candidate.matchReasons).toContain('name');

    const { mergeAuditId } = await mergeGuestCardsForOrg({
      orgId: org.id,
      userId: null,
      targetGuestCardId: first.guestCardId,
      sourceGuestCardId: second.guestCardId,
      duplicateCandidateId: candidate.id,
    });

    const [sourceAfterMerge] = await db
      .select()
      .from(guestCards)
      .where(eq(guestCards.id, second.guestCardId));
    expect(sourceAfterMerge.status).toBe('merged');
    expect(sourceAfterMerge.mergedIntoGuestCardId).toBe(first.guestCardId);

    const [movedConversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, secondConversation.id));
    expect(movedConversation.guestCardId).toBe(first.guestCardId);

    const [audit] = await db
      .select()
      .from(guestCardMergeAudits)
      .where(eq(guestCardMergeAudits.id, mergeAuditId));
    expect(audit.reversible).toBe(true);
    expect(audit.sourceSnapshot).toMatchObject({
      guestCard: { id: second.guestCardId },
      conversationIds: [secondConversation.id],
    });

    await revertGuestCardMergeForOrg({
      orgId: org.id,
      userId: null,
      mergeAuditId,
    });

    const [sourceAfterRevert] = await db
      .select()
      .from(guestCards)
      .where(eq(guestCards.id, second.guestCardId));
    expect(sourceAfterRevert.status).toBe('active');
    expect(sourceAfterRevert.mergedIntoGuestCardId).toBeNull();

    const [conversationAfterRevert] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, secondConversation.id));
    expect(conversationAfterRevert.guestCardId).toBe(second.guestCardId);
  });
});
