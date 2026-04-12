import { type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { db, eq } from '@omnilease/db';
import { properties } from '@omnilease/db';

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const widgetId = typeof body?.widgetId === 'string' ? body.widgetId : null;
  if (!widgetId) {
    return Response.json({ error: 'widgetId required' }, { status: 400 });
  }

  const [property] = await db
    .select({
      id: properties.id,
      name: properties.name,
      brandColor: properties.brandColor,
      welcomeMessage: properties.welcomeMessage,
    })
    .from(properties)
    .where(eq(properties.webchatWidgetId, widgetId))
    .limit(1);

  if (!property) {
    return Response.json({ error: 'unknown widgetId' }, { status: 404 });
  }

  const sessionId = randomUUID();

  return Response.json({
    sessionId,
    property: {
      name: property.name,
      brandColor: property.brandColor ?? '#111827',
      welcomeMessage: property.welcomeMessage ?? `Hi there — how can I help you today?`,
    },
  });
}
