import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

// Hoisted mocks — must be set up before the route handler imports.
const { generateTextMock, sendSmsMock, afterSpy } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  sendSmsMock: vi.fn().mockResolvedValue(undefined),
  afterSpy: vi.fn(),
}));

// Mock AI SDK — we only care that processConversation runs, not what the LLM says.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: generateTextMock };
});

// Mock Resend so escalation emails don't try to hit a real API.
vi.mock('@/lib/email/resend', () => ({
  sendEscalationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock the Twilio send boundary — we're testing the webhook handler, not
// Twilio's network path.
vi.mock('@/lib/twilio/send', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/twilio/send')>('@/lib/twilio/send');
  return {
    ...actual,
    sendSms: sendSmsMock,
  };
});

// Make Next.js after() run synchronously in tests — we want to observe its
// side effects in the same tick as the response.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: (cb: () => Promise<void>) => {
      afterSpy();
      return cb();
    },
  };
});

import { db, eq } from '@omnilease/db';
import {
  organizations,
  properties,
  conversations,
  messages,
  smsOptOuts,
  consentRecords,
} from '@omnilease/db';
import { POST } from '../route';

const TEST_PREFIX = 'sms-int-';
const AUTH_TOKEN = 'fake_auth_token_for_tests';
const APP_URL = 'https://app.example.com';
const TWILIO_FROM = '+15557654321';

function signRequest(url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const data = url + sortedKeys.map((k) => `${k}${params[k]}`).join('');
  return createHmac('sha1', AUTH_TOKEN).update(data).digest('base64');
}

async function seedProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();
  const [prop] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      name: 'Sunset Ridge',
      timezone: 'America/Chicago',
      twilioPhone: TWILIO_FROM,
      escalationEmail: 'mgr@example.com',
    })
    .returning();
  return { orgId: org.id, propertyId: prop.id };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

function buildRequest(body: Record<string, string>): Request {
  const form = new URLSearchParams(body).toString();
  const url = APP_URL + '/api/webhooks/twilio/sms';
  const signature = signRequest(url, body);
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: form,
  });
}

describe('POST /api/webhooks/twilio/sms (integration)', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    sendSmsMock.mockReset();
    sendSmsMock.mockResolvedValue(undefined);
    afterSpy.mockReset();
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    process.env.APP_URL = APP_URL;
  });

  it('rejects unsigned requests with 403', async () => {
    const form = new URLSearchParams({
      From: '+15551111111',
      To: TWILIO_FROM,
      Body: 'hello',
    }).toString();
    const res = await POST(
      new Request(APP_URL + '/api/webhooks/twilio/sms', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      }) as any,
    );
    expect(res.status).toBe(403);
  });

  it('happy path: signs in, persists inbound, acks TwiML, triggers engine + send', async () => {
    const { orgId, propertyId } = await seedProperty();
    try {
      generateTextMock.mockResolvedValue({
        text: 'Yes — we welcome dogs up to 75 lbs.',
        steps: [],
      });

      const req = buildRequest({
        From: '+15551111111',
        To: TWILIO_FROM,
        Body: 'Do you allow dogs?',
        MessageSid: 'SM_test_1',
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('<Response');

      // Conversation + inbound message persisted
      const convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.propertyId, propertyId));
      expect(convs.length).toBe(1);
      expect(convs[0].channel).toBe('sms');
      expect(convs[0].externalId).toBe('+15551111111');

      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convs[0].id));
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      const inbound = msgs.find((m) => m.authorType === 'prospect');
      expect(inbound).toBeTruthy();
      expect((inbound?.metadata as { intent?: string })?.intent).toBe('pets');

      // Consent record for first contact
      const consent = await db
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.propertyId, propertyId));
      expect(consent.length).toBe(1);
      expect(consent[0].source).toBe('first_contact');

      // after() ran and called sendSms
      expect(afterSpy).toHaveBeenCalled();
      expect(sendSmsMock).toHaveBeenCalledTimes(1);
      expect(sendSmsMock.mock.calls[0][0].body).toContain('75 lbs');
      expect(sendSmsMock.mock.calls[0][0].to).toBe('+15551111111');
    } finally {
      await cleanup(orgId);
    }
  });

  it('STOP keyword: records opt-out, sends ack, does not hit engine', async () => {
    const { orgId, propertyId } = await seedProperty();
    try {
      const req = buildRequest({
        From: '+15552222222',
        To: TWILIO_FROM,
        Body: 'STOP',
        MessageSid: 'SM_test_stop',
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);

      const optOuts = await db
        .select()
        .from(smsOptOuts)
        .where(eq(smsOptOuts.propertyId, propertyId));
      expect(optOuts.length).toBe(1);
      expect(optOuts[0].phone).toBe('+15552222222');
      expect(optOuts[0].keyword).toBe('STOP');

      // Ack was sent (directReply: true)
      expect(sendSmsMock).toHaveBeenCalledTimes(1);
      expect(sendSmsMock.mock.calls[0][0].body).toMatch(/unsubscribed/i);

      // Engine was NOT called — generateText untouched
      expect(generateTextMock).not.toHaveBeenCalled();
    } finally {
      await cleanup(orgId);
    }
  });

  it('already-opted-out recipient: silent ack, no engine, no send', async () => {
    const { orgId, propertyId } = await seedProperty();
    try {
      await db.insert(smsOptOuts).values({
        propertyId,
        phone: '+15553333333',
        keyword: 'STOP',
      });

      const req = buildRequest({
        From: '+15553333333',
        To: TWILIO_FROM,
        Body: 'hey can you help?',
        MessageSid: 'SM_test_optedout',
      });

      const res = await POST(req as any);
      expect(res.status).toBe(200);

      const convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.propertyId, propertyId));
      expect(convs.length).toBe(0);
      expect(sendSmsMock).not.toHaveBeenCalled();
      expect(generateTextMock).not.toHaveBeenCalled();
    } finally {
      await cleanup(orgId);
    }
  });

  it('unknown To number: silent ack, no conversation', async () => {
    const req = buildRequest({
      From: '+15554444444',
      To: '+15559999999',
      Body: 'hi',
      MessageSid: 'SM_test_unknown',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
