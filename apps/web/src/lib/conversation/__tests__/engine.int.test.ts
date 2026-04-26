import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// vi.hoisted ensures these variables are initialized BEFORE the vi.mock factories
// run (which are hoisted to the top of the file by Vitest's transform pass).
const { generateTextMock, resendSendMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  resendSendMock: vi.fn().mockResolvedValue(undefined),
}));

// Mock ONLY the AI SDK generateText call + the Resend send. Everything else
// (DB, drizzle, safety, tools, escalation pipeline) is real.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: generateTextMock };
});

vi.mock('@/lib/email/resend', () => ({
  sendEscalationEmail: resendSendMock,
}));

// Import AFTER mocks so the engine picks them up.
import { db, eq } from '@omnilease/db';
import {
  organizations,
  properties,
  unitTypes,
  conversations,
  messages,
  escalations,
} from '@omnilease/db';
import { processConversation } from '../engine';

const TEST_PREFIX = 'int-test-';

async function seedProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();

  const [prop] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      slug: `sunset-ridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Sunset Ridge',
      address: '123 Main St',
      city: 'Pensacola',
      state: 'FL',
      timezone: 'America/Chicago',
      escalationEmail: 'manager@example.com',
      welcomeMessage: null,
    })
    .returning();

  await db.insert(unitTypes).values([
    {
      propertyId: prop.id,
      name: '1BR/1BA',
      bedrooms: 1,
      bathrooms: '1',
      sqftMin: 650,
      sqftMax: 720,
      priceMin: '1500',
      priceMax: '1700',
      availableCount: 3,
      deposit: '500',
      isActive: true,
    },
  ]);

  const contextDir = path.join(process.cwd(), 'content', 'properties', prop.slug);
  await mkdir(contextDir, { recursive: true });
  await writeFile(
    path.join(contextDir, 'policies.md'),
    '# Policies\nDogs are allowed up to 75 lbs with pet rent.',
    'utf8',
  );

  const [conv] = await db
    .insert(conversations)
    .values({
      propertyId: prop.id,
      channel: 'messenger',
      externalId: 'm_15551234567',
      status: 'active',
    })
    .returning();

  await db.insert(messages).values({
    conversationId: conv.id,
    role: 'user',
    authorType: 'prospect',
    content: 'Do you allow dogs?',
    channel: 'messenger',
  });

  return { orgId: org.id, propertyId: prop.id, propertySlug: prop.slug, conversationId: conv.id };
}

async function cleanup(orgId: string, propertySlug: string) {
  // Cascades via FKs: organizations -> properties -> conversations -> messages -> escalations.
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await rm(path.join(process.cwd(), 'content', 'properties', propertySlug), {
    recursive: true,
    force: true,
  });
}

describe('processConversation (integration)', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    resendSendMock.mockReset();
    resendSendMock.mockResolvedValue(undefined);
  });

  it('happy path — generates a reply, persists it, returns intent + confidence', async () => {
    const { orgId, propertyId, propertySlug, conversationId } = await seedProperty();
    try {
      generateTextMock.mockResolvedValue({
        text: 'Yes — we welcome dogs up to 75 lbs! Want to come see a 1BR?',
        steps: [],
      });

      const result = await processConversation({
        conversationId,
        propertyId,
        inboundText: 'Do you allow dogs? I have a 60lb golden',
        channel: 'messenger',
      });

      expect(result.intent).toBe('pets');
      expect(result.escalated).toBe(false);
      expect(result.assistantText).toContain('75 lbs');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      expect(rows.length).toBe(2); // seeded user message + assistant reply
      const assistant = rows.find((r) => r.role === 'assistant');
      expect(assistant?.authorType).toBe('ai');
      expect(assistant?.content).toContain('75 lbs');
    } finally {
      await cleanup(orgId, propertySlug);
    }
  });

  it('escalates when the model calls escalate_to_human and emails the agent', async () => {
    const { orgId, propertyId, propertySlug, conversationId } = await seedProperty();
    try {
      generateTextMock.mockResolvedValue({
        text: 'Got it — one of our team members will follow up with you shortly.',
        steps: [
          {
            toolCalls: [
              {
                toolName: 'escalate_to_human',
                input: { reason: 'Prospect asked to speak with a human', priority: 'normal' },
              },
            ],
          },
        ],
      });

      const result = await processConversation({
        conversationId,
        propertyId,
        inboundText: 'Can I talk to a real person please',
        channel: 'messenger',
      });

      expect(result.escalated).toBe(true);

      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      expect(conv.status).toBe('escalated');
      expect(conv.automationState).toBe('human_takeover');

      const escalationRows = await db
        .select()
        .from(escalations)
        .where(eq(escalations.conversationId, conversationId));
      expect(escalationRows.length).toBe(1);
      expect(escalationRows[0].reason).toContain('speak with a human');

      expect(resendSendMock).toHaveBeenCalledTimes(1);
      const arg = resendSendMock.mock.calls[0][0];
      expect(arg.to).toBe('manager@example.com');
      expect(arg.propertyName).toBe('Sunset Ridge');
    } finally {
      await cleanup(orgId, propertySlug);
    }
  });

  it('does not generate an AI reply while human takeover is active', async () => {
    const { orgId, propertyId, propertySlug, conversationId } = await seedProperty();
    try {
      await db
        .update(conversations)
        .set({
          status: 'escalated',
          automationState: 'human_takeover',
        })
        .where(eq(conversations.id, conversationId));

      const result = await processConversation({
        conversationId,
        propertyId,
        inboundText: 'Are you still there?',
        channel: 'messenger',
      });

      expect(generateTextMock).not.toHaveBeenCalled();
      expect(result.assistantText).toBe('');
      expect(result.escalated).toBe(true);

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      expect(rows.length).toBe(1); // seeded prospect message only
    } finally {
      await cleanup(orgId, propertySlug);
    }
  });

  it('auto-escalates on low confidence and replaces flagged text', async () => {
    const { orgId, propertyId, propertySlug, conversationId } = await seedProperty();
    try {
      // Use a hedged response with NO fair-housing phrases so that the safety
      // filter doesn't swap the text out before counting hedges. The neutral
      // fallback text has zero hedges (confidence 0.95), but this text has
      // "I'm not sure", "I think", "maybe", and "I don't really know" — 4
      // hedges → confidence = max(0, 0.95 - 4*0.15) = 0.35 → autoEscalate.
      generateTextMock.mockResolvedValue({
        text: "I'm not sure about the area. I think maybe the transit options are okay? I don't really know the specifics.",
        steps: [],
      });

      const result = await processConversation({
        conversationId,
        propertyId,
        inboundText: 'Is this a good area for commuting?',
        channel: 'messenger',
      });

      expect(result.escalated).toBe(true);
      expect(result.confidence).toBeLessThan(0.7);
      expect(resendSendMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup(orgId, propertySlug);
    }
  });
});
