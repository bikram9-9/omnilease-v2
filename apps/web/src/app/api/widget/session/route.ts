import { type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db, eq } from '@omnilease/db';
import { properties } from '@omnilease/db';
import { buildWidgetDisclosureConfig } from '@/lib/widget-disclosure';

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const widgetId = typeof body?.widgetId === 'string' ? body.widgetId : null;
  const existingSessionId = typeof body?.sessionId === 'string' && body.sessionId.trim()
    ? body.sessionId.trim()
    : null;
  if (!widgetId) {
    return Response.json({ error: 'widgetId required' }, { status: 400 });
  }

  const [property] = await db
    .select({
      id: properties.id,
      name: properties.name,
      brandColor: properties.brandColor,
      welcomeMessage: properties.welcomeMessage,
      aiDisclosure: properties.aiDisclosure,
      privacyNoticeUrl: properties.privacyNoticeUrl,
      termsUrl: properties.termsUrl,
      privacyDisclosureText: properties.privacyDisclosureText,
      contactFallbackLabel: properties.contactFallbackLabel,
      contactFallbackUrl: properties.contactFallbackUrl,
      contactFallbackText: properties.contactFallbackText,
    })
    .from(properties)
    .where(eq(properties.websiteWidgetId, widgetId))
    .limit(1);

  if (!property) {
    return Response.json({ error: 'unknown widgetId' }, { status: 404 });
  }

  const sessionId = existingSessionId ?? randomUUID();
  const disclosure = buildWidgetDisclosureConfig(property);

  return Response.json({
    sessionId,
    source: {
      channel: 'website',
      source: 'website_widget',
    },
    property: {
      name: property.name,
      brandColor: property.brandColor ?? '#111827',
      welcomeMessage: property.welcomeMessage ?? `Hi there — how can I help you today?`,
      initialAssistantMessage: disclosure.initialAssistantMessage,
    },
    disclosure,
  });
}
