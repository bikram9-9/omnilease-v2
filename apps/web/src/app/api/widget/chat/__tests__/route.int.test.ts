import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';

// Hoisted mocks
const { streamTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, streamText: streamTextMock };
});

vi.mock('@/lib/email/resend', () => ({
  sendEscalationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { db, eq } from '@omnilease/db';
import {
  organizations,
  properties,
  conversations,
  escalations,
  guestCardActivities,
  guestCards,
  messages,
  tourBookings,
  tourNotificationJobs,
} from '@omnilease/db';
import { POST } from '../route';

const TEST_PREFIX = 'widget-int-';

async function seedProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();
  const widgetId = `wdg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const [prop] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      slug: `sunset-ridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Sunset Ridge',
      timezone: 'America/Chicago',
      websiteWidgetId: widgetId,
      escalationEmail: 'manager@example.com',
    })
    .returning();

  const contextDir = path.join(process.cwd(), 'content', 'properties', prop.slug);
  await mkdir(contextDir, { recursive: true });
  await writeFile(path.join(contextDir, 'overview.md'), '# Sunset Ridge\nA calm garden-style property.', 'utf8');
  return { orgId: org.id, propertyId: prop.id, propertySlug: prop.slug, widgetId };
}

async function cleanup(orgId: string, propertySlug: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await rm(path.join(process.cwd(), 'content', 'properties', propertySlug), {
    recursive: true,
    force: true,
  });
}

// Fake streamText return — provides a .toUIMessageStreamResponse() that yields
// a minimal SSE body. Also invokes onFinish synchronously so assistant
// persistence happens before the test awaits cleanup.
function fakeStreamResult(text: string) {
  return {
    toUIMessageStreamResponse: () =>
      new Response(
        `data: {"type":"text-delta","delta":"${text}"}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
  };
}

describe('POST /api/widget/chat (integration)', () => {
  beforeEach(() => {
    streamTextMock.mockReset();
  });

  it('rejects missing fields with 400', async () => {
    const req = new Request('https://app.example.com/api/widget/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ widgetId: 'x', sessionId: 'y' }), // missing text
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it('rejects unknown widgetId with 404', async () => {
    streamTextMock.mockImplementation(() => fakeStreamResult('hi'));
    const req = new Request('https://app.example.com/api/widget/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        widgetId: 'unknown',
        sessionId: 'sess_1',
        text: 'hello',
      }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(404);
  });

  it('creates a conversation, persists inbound, returns a streaming response', async () => {
    const { orgId, propertyId, propertySlug, widgetId } = await seedProperty();
    try {
      let capturedOnFinish: ((arg: unknown) => void) | undefined;
      streamTextMock.mockImplementation((opts: Record<string, unknown>) => {
        capturedOnFinish = opts.onFinish as typeof capturedOnFinish;
        return fakeStreamResult('Yes we welcome dogs!');
      });

      const req = new Request('https://app.example.com/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          widgetId,
          sessionId: 'sess_xyz',
          text: 'Do you allow dogs?',
          pageUrl: 'https://property.example.com/floorplans',
          referrer: 'https://property.example.com/',
          userAgent: 'Vitest Browser',
        }),
      });

      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      // Invoke onFinish to simulate stream completion
      if (capturedOnFinish) {
        await capturedOnFinish({
          text: 'Yes we welcome dogs!',
          steps: [],
        });
      }

      // Conversation created
      const convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.propertyId, propertyId));
      expect(convs.length).toBe(1);
      expect(convs[0].channel).toBe('website');
      expect(convs[0].externalId).toBe('sess_xyz');
      expect(convs[0].metadata).toMatchObject({
        source: 'website_widget',
        channel: 'website',
        widgetId,
        pageUrl: 'https://property.example.com/floorplans',
        referrer: 'https://property.example.com/',
        userAgent: 'Vitest Browser',
      });
      expect(convs[0].guestCardId).toEqual(expect.any(String));
      const guestCardId = convs[0].guestCardId;
      if (!guestCardId) throw new Error('expected conversation to link to a guest card');

      const [guestCard] = await db
        .select()
        .from(guestCards)
        .where(eq(guestCards.id, guestCardId));
      expect(guestCard).toMatchObject({
        orgId,
        primaryPropertyId: propertyId,
        firstChannel: 'website',
        source: 'website_widget',
      });

      // Inbound prospect message persisted with intent
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convs[0].id));
      const prospect = rows.find((r) => r.authorType === 'prospect');
      expect(prospect?.content).toBe('Do you allow dogs?');
      expect((prospect?.metadata as { intent?: string })?.intent).toBe('pets');
      expect(prospect?.metadata).toMatchObject({
        source: 'website_widget',
        pageUrl: 'https://property.example.com/floorplans',
        referrer: 'https://property.example.com/',
      });

      // Assistant message persisted by onFinish
      const assistant = rows.find((r) => r.authorType === 'ai');
      expect(assistant?.content).toContain('welcome dogs');
      expect(assistant?.channel).toBe('website');
    } finally {
      await cleanup(orgId, propertySlug);
    }
  });

  it('persists inbound messages but does not invoke AI during human takeover', async () => {
    const { orgId, propertyId, propertySlug, widgetId } = await seedProperty();
    try {
      const [conversation] = await db
        .insert(conversations)
        .values({
          propertyId,
          channel: 'website',
          externalId: 'sess_takeover',
          status: 'escalated',
          automationState: 'human_takeover',
        })
        .returning();

      const req = new Request('https://app.example.com/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          widgetId,
          sessionId: 'sess_takeover',
          text: 'Are you still there?',
          pageUrl: 'https://property.example.com/contact',
        }),
      });

      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(await res.text()).toContain('leasing specialist');
      expect(streamTextMock).not.toHaveBeenCalled();

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        role: 'user',
        authorType: 'prospect',
        content: 'Are you still there?',
      });
    } finally {
      await cleanup(orgId, propertySlug);
    }
  });

  it('escalates emergency messages, pauses AI, and persists the emergency notice', async () => {
    const { orgId, propertyId, propertySlug, widgetId } = await seedProperty();
    try {
      const req = new Request('https://app.example.com/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          widgetId,
          sessionId: 'sess_emergency',
          text: 'Emergency maintenance: water is flooding my apartment right now.',
          pageUrl: 'https://property.example.com/contact',
        }),
      });

      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(await res.text()).toContain('call 911');
      expect(streamTextMock).not.toHaveBeenCalled();

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.propertyId, propertyId));
      expect(conversation).toMatchObject({
        status: 'escalated',
        automationState: 'human_takeover',
        escalationReason: 'Emergency or urgent maintenance request',
      });

      const escalationRows = await db
        .select()
        .from(escalations)
        .where(eq(escalations.conversationId, conversation.id));
      expect(escalationRows).toHaveLength(1);
      expect(escalationRows[0]).toMatchObject({
        priority: 'urgent',
        reason: 'Emergency or urgent maintenance request',
      });

      const messageRows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id));
      const prospect = messageRows.find((message) => message.authorType === 'prospect');
      const assistant = messageRows.find((message) => message.authorType === 'ai');
      expect(prospect?.content).toContain('Emergency maintenance');
      expect(assistant?.content).toContain('property emergency maintenance line');
    } finally {
      await cleanup(orgId, propertySlug);
    }
  });

  it('routes unsupported application questions to human review without streaming AI', async () => {
    const { orgId, propertyId, propertySlug, widgetId } = await seedProperty();
    try {
      const req = new Request('https://app.example.com/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          widgetId,
          sessionId: 'sess_application_guardrail',
          text: 'Can you send me the application link and screening requirements?',
          pageUrl: 'https://property.example.com/apply',
        }),
      });

      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("don't want to guess");
      expect(streamTextMock).not.toHaveBeenCalled();

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.propertyId, propertyId));
      expect(conversation).toMatchObject({
        status: 'escalated',
        automationState: 'human_takeover',
        escalationReason: 'Application request lacks structured application source data',
      });
      expect(conversation.metadata).toMatchObject({
        lastAnswerQualityReview: {
          category: 'unsupported_application',
          routedToHuman: true,
        },
      });

      const messageRows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id));
      const assistant = messageRows.find((message) => message.authorType === 'ai');
      expect(assistant?.metadata).toMatchObject({
        answerQuality: {
          category: 'unsupported_application',
          reason: 'Application request lacks structured application source data',
        },
      });
    } finally {
      await cleanup(orgId, propertySlug);
    }
  });

  it('persists STOP opt-out state and suppresses pending automated follow-ups', async () => {
    const { orgId, propertyId, propertySlug, widgetId } = await seedProperty();
    try {
      const [conversation] = await db
        .insert(conversations)
        .values({
          propertyId,
          channel: 'website',
          externalId: 'sess_stop',
          status: 'active',
        })
        .returning();
      const [guestCard] = await db
        .insert(guestCards)
        .values({
          orgId,
          primaryPropertyId: propertyId,
          email: 'stop@example.com',
          normalizedEmail: 'stop@example.com',
          emailConsentStatus: 'subscribed',
          smsConsentStatus: 'subscribed',
          marketingConsentStatus: 'subscribed',
          source: 'test',
        })
        .returning();
      await db.update(conversations).set({ guestCardId: guestCard.id }).where(eq(conversations.id, conversation.id));
      const [booking] = await db
        .insert(tourBookings)
        .values({
          propertyId,
          guestCardId: guestCard.id,
          conversationId: conversation.id,
          tourType: 'in_person',
          status: 'booked',
          startAt: new Date('2026-04-27T15:00:00.000Z'),
          endAt: new Date('2026-04-27T15:30:00.000Z'),
          timezone: 'America/Chicago',
          source: 'ai_tool',
        })
        .returning();
      const [job] = await db
        .insert(tourNotificationJobs)
        .values({
          tourBookingId: booking.id,
          propertyId,
          guestCardId: guestCard.id,
          conversationId: conversation.id,
          jobType: 'tour_reminder',
          recipientKind: 'prospect',
          channel: 'email',
          status: 'pending',
          runAt: new Date('2026-04-27T15:00:00.000Z'),
          nextAttemptAt: new Date('2026-04-27T15:00:00.000Z'),
        })
        .returning();

      const req = new Request('https://app.example.com/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          widgetId,
          sessionId: 'sess_stop',
          text: 'STOP',
        }),
      });

      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("You're opted out");
      expect(streamTextMock).not.toHaveBeenCalled();

      const [updatedGuestCard] = await db.select().from(guestCards).where(eq(guestCards.id, guestCard.id));
      expect(updatedGuestCard).toMatchObject({
        emailConsentStatus: 'opted_out',
        smsConsentStatus: 'opted_out',
        marketingConsentStatus: 'opted_out',
      });
      const [updatedJob] = await db.select().from(tourNotificationJobs).where(eq(tourNotificationJobs.id, job.id));
      expect(updatedJob).toMatchObject({
        status: 'suppressed',
        lastError: 'Prospect opted out via widget message.',
      });
      const activities = await db.select().from(guestCardActivities).where(eq(guestCardActivities.guestCardId, guestCard.id));
      expect(activities.some((activity) => activity.title === 'Prospect opted out of automated outreach')).toBe(true);
    } finally {
      await cleanup(orgId, propertySlug);
    }
  });
});
