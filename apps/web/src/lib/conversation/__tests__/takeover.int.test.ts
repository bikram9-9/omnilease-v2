import { describe, expect, it } from 'vitest';
import { db, eq } from '@omnilease/db';
import {
  conversations,
  messages,
  organizations,
  properties,
} from '@omnilease/db';
import {
  ConversationActionError,
  sendHumanReplyForOrg,
  setConversationAutomationForOrg,
} from '../takeover';

const TEST_PREFIX = 'takeover-int-';

async function seedConversation() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();

  const [property] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      slug: `${TEST_PREFIX}property-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Sunset Ridge',
      timezone: 'America/Chicago',
      websiteWidgetId: `wdg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    })
    .returning();

  const [conversation] = await db
    .insert(conversations)
    .values({
      propertyId: property.id,
      channel: 'website',
      externalId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'active',
      automationState: 'ai_active',
    })
    .returning();

  return {
    orgId: org.id,
    userId: null,
    conversationId: conversation.id,
  };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe('conversation takeover service (integration)', () => {
  it('persists a human reply and moves the conversation into takeover', async () => {
    const seed = await seedConversation();
    try {
      await sendHumanReplyForOrg({
        orgId: seed.orgId,
        userId: seed.userId,
        conversationId: seed.conversationId,
        content: 'Thanks for reaching out. I can help from here.',
      });

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, seed.conversationId));
      expect(conversation.status).toBe('escalated');
      expect(conversation.automationState).toBe('human_takeover');
      expect(conversation.assignedAgentId).toBeNull();

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, seed.conversationId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        role: 'assistant',
        authorType: 'human_agent',
        content: 'Thanks for reaching out. I can help from here.',
        channel: 'website',
      });
      expect(rows[0].metadata).toMatchObject({ source: 'dashboard_reply' });
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('returns a takeover conversation to AI control', async () => {
    const seed = await seedConversation();
    try {
      await setConversationAutomationForOrg({
        orgId: seed.orgId,
        userId: seed.userId,
        conversationId: seed.conversationId,
        action: 'take_over',
      });
      await setConversationAutomationForOrg({
        orgId: seed.orgId,
        userId: seed.userId,
        conversationId: seed.conversationId,
        action: 'return_to_ai',
      });

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, seed.conversationId));
      expect(conversation.status).toBe('active');
      expect(conversation.automationState).toBe('ai_active');
      expect(conversation.assignedAgentId).toBeNull();
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('rejects human replies after a conversation is closed', async () => {
    const seed = await seedConversation();
    try {
      await setConversationAutomationForOrg({
        orgId: seed.orgId,
        userId: seed.userId,
        conversationId: seed.conversationId,
        action: 'close',
      });

      await expect(sendHumanReplyForOrg({
        orgId: seed.orgId,
        userId: seed.userId,
        conversationId: seed.conversationId,
        content: 'Following up after close.',
      })).rejects.toBeInstanceOf(ConversationActionError);

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, seed.conversationId));
      expect(rows).toHaveLength(0);
    } finally {
      await cleanup(seed.orgId);
    }
  });
});
