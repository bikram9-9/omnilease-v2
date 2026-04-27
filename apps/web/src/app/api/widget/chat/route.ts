import { type NextRequest } from 'next/server';
import { db, eq, and } from '@omnilease/db';
import { properties, conversations, messages } from '@omnilease/db';
import { streamConversationForWidget } from '@/lib/conversation/engine';
import { escalateConversation } from '@/lib/conversation/escalate';
import { classifyEscalationTrigger } from '@/lib/conversation/escalation-intent';
import { classifyIntent } from '@/lib/conversation/intent';
import { allowsAiReply } from '@/lib/conversation/takeover';
import { syncGuestCardForConversation } from '@/lib/guest-cards/service';
import { persistConversationOptOut } from '@/lib/outreach-opt-out';
import { classifyOptOutMessage } from '@/lib/outreach-safety';

export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const widgetId = typeof body?.widgetId === 'string' ? body.widgetId : null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  const text = typeof body?.text === 'string' ? body.text.trim() : null;
  const pageUrl = typeof body?.pageUrl === 'string' ? body.pageUrl.slice(0, 500) : null;
  const referrer = typeof body?.referrer === 'string' ? body.referrer.slice(0, 500) : null;
  const userAgent = typeof body?.userAgent === 'string' ? body.userAgent.slice(0, 500) : null;

  if (!widgetId || !sessionId || !text) {
    return new Response('widgetId, sessionId, and text required', { status: 400 });
  }

  // Resolve property
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.websiteWidgetId, widgetId))
    .limit(1);
  if (!property) return new Response('unknown widget', { status: 404 });

  // Get or create conversation keyed by session
  let conversationId: string;
  let aiReplyAllowed = true;
  let pausedNotice = 'A leasing specialist has joined this conversation and will reply soon.';
  const [existing] = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      automationState: conversations.automationState,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.propertyId, property.id),
        eq(conversations.externalId, sessionId),
        eq(conversations.channel, 'website'),
      ),
    )
    .limit(1);

  if (existing) {
    conversationId = existing.id;
    aiReplyAllowed = allowsAiReply(existing);
    pausedNotice = getPausedNotice(existing);
  } else {
    const [created] = await db
      .insert(conversations)
      .values({
        propertyId: property.id,
        channel: 'website',
        externalId: sessionId,
        status: 'active',
        metadata: {
          source: 'website_widget',
          channel: 'website',
          widgetId,
          pageUrl,
          referrer,
          userAgent,
        },
      })
      .returning({ id: conversations.id });
    conversationId = created.id;
  }

  // Persist the inbound prospect message with detected intent
  await db.insert(messages).values({
    conversationId,
    role: 'user',
    authorType: 'prospect',
    content: text,
    channel: 'website',
    metadata: {
      intent: classifyIntent(text),
      source: 'website_widget',
      pageUrl,
      referrer,
    },
  });

  await syncGuestCardForConversation({
    conversationId,
    propertyId: property.id,
    channel: 'website',
    externalId: sessionId,
    source: 'website_widget',
    metadata: {
      widgetId,
      pageUrl,
      referrer,
      userAgent,
    },
  });

  if (classifyOptOutMessage(text)) {
    await persistConversationOptOut({
      conversationId,
      propertyId: property.id,
      reason: 'Prospect opted out via widget message.',
    });
    return widgetNoticeStream(
      "You're opted out of automated follow-up messages. Contact the property team directly if you still need help.",
    );
  }

  const escalationTrigger = classifyEscalationTrigger(text);
  if (escalationTrigger && aiReplyAllowed) {
    await escalateConversation({
      conversationId,
      propertyId: property.id,
      reason: escalationTrigger.reason,
      priority: escalationTrigger.priority,
    });
    await db.insert(messages).values({
      conversationId,
      role: 'assistant',
      authorType: 'ai',
      content: escalationTrigger.notice,
      channel: 'website',
      confidenceScore: '1.00',
      metadata: {
        escalationCategory: escalationTrigger.category,
        escalationReason: escalationTrigger.reason,
        source: 'rule_based_escalation_gate',
      },
    });

    return widgetNoticeStream(escalationTrigger.notice);
  }

  if (!aiReplyAllowed) {
    return widgetNoticeStream(pausedNotice);
  }

  // Stream the assistant reply
  return await streamConversationForWidget({
    conversationId,
    propertyId: property.id,
    inboundText: text,
    channel: 'website',
  });
}

function getPausedNotice(conversation: {
  status: typeof conversations.$inferSelect.status;
  automationState: typeof conversations.$inferSelect.automationState;
}): string {
  if (conversation.status === 'closed') {
    return 'This conversation has been closed by the leasing team.';
  }

  if (conversation.status === 'converted') {
    return 'Thanks — the leasing team has marked this conversation complete.';
  }

  if (conversation.automationState === 'human_takeover') {
    return 'A leasing specialist has joined this conversation and will reply soon.';
  }

  return 'A leasing specialist will review this message soon.';
}

function widgetNoticeStream(text: string): Response {
  return new Response(
    `data: ${JSON.stringify({ type: 'text-delta', delta: text })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}
