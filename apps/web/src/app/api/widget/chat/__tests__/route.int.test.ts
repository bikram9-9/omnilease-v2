import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  messages,
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
      name: 'Sunset Ridge',
      timezone: 'America/Chicago',
      webchatWidgetId: widgetId,
    })
    .returning();
  return { orgId: org.id, propertyId: prop.id, widgetId };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
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
    const res = await POST(req as any);
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
    const res = await POST(req as any);
    expect(res.status).toBe(404);
  });

  it('creates a conversation, persists inbound, returns a streaming response', async () => {
    const { orgId, propertyId, widgetId } = await seedProperty();
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
        }),
      });

      const res = await POST(req as any);
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
      expect(convs[0].channel).toBe('webchat');
      expect(convs[0].externalId).toBe('sess_xyz');

      // Inbound prospect message persisted with intent
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convs[0].id));
      const prospect = rows.find((r) => r.authorType === 'prospect');
      expect(prospect?.content).toBe('Do you allow dogs?');
      expect((prospect?.metadata as { intent?: string })?.intent).toBe('pets');

      // Assistant message persisted by onFinish
      const assistant = rows.find((r) => r.authorType === 'ai');
      expect(assistant?.content).toContain('welcome dogs');
      expect(assistant?.channel).toBe('webchat');
    } finally {
      await cleanup(orgId);
    }
  });
});
