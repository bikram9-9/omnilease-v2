import { type NextRequest } from 'next/server';
import { db, eq, and } from '@omnilease/db';
import { properties, conversations, messages } from '@omnilease/db';
import { streamConversationForWidget } from '@/lib/conversation/engine';
import { classifyIntent } from '@/lib/conversation/intent';

export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const widgetId = typeof body?.widgetId === 'string' ? body.widgetId : null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
  const text = typeof body?.text === 'string' ? body.text.trim() : null;

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
  const [existing] = await db
    .select({ id: conversations.id })
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
  } else {
    const [created] = await db
      .insert(conversations)
      .values({
        propertyId: property.id,
        channel: 'website',
        externalId: sessionId,
        status: 'active',
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
    metadata: { intent: classifyIntent(text) },
  });

  // Stream the assistant reply
  return await streamConversationForWidget({
    conversationId,
    propertyId: property.id,
    inboundText: text,
    channel: 'website',
  });
}
