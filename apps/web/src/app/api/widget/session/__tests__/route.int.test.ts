import { describe, it, expect, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { db, eq } from '@omnilease/db';
import { organizations, properties } from '@omnilease/db';
import { POST } from '../route';

const TEST_PREFIX = 'widget-session-int-';
const orgIds: string[] = [];

async function seedProperty() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();
  orgIds.push(org.id);

  const widgetId = `wdg_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(properties).values({
    orgId: org.id,
    slug: `widget-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Session Test Apartments',
    timezone: 'America/Chicago',
    websiteWidgetId: widgetId,
    brandColor: '#0f766e',
    welcomeMessage: 'Welcome back.',
  });

  return { widgetId };
}

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => db.delete(organizations).where(eq(organizations.id, orgId))));
});

describe('POST /api/widget/session (integration)', () => {
  it('requires a widgetId', async () => {
    const req = new Request('https://app.example.com/api/widget/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it('returns property branding and reuses an existing browser session id', async () => {
    const { widgetId } = await seedProperty();
    const req = new Request('https://app.example.com/api/widget/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        widgetId,
        sessionId: 'existing-session-id',
        pageUrl: 'https://property.example.com/',
        referrer: 'https://google.example/',
      }),
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessionId).toBe('existing-session-id');
    expect(json.source).toEqual({ channel: 'website', source: 'website_widget' });
    expect(json.property).toEqual({
      name: 'Session Test Apartments',
      brandColor: '#0f766e',
      welcomeMessage: 'Welcome back.',
    });
  });
});
