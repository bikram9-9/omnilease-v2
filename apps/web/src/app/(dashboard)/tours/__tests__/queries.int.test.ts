import { describe, expect, it } from 'vitest';
import { db, eq } from '@omnilease/db';
import {
  conversations,
  guestCards,
  organizations,
  properties,
  tourBookings,
} from '@omnilease/db';
import { getTourDashboardForOrg } from '../queries';

const TEST_PREFIX = 'tour-dashboard-int-';

async function seedTourDashboard() {
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
    })
    .returning();

  const [guestCard] = await db
    .insert(guestCards)
    .values({
      orgId: org.id,
      primaryPropertyId: property.id,
      fullName: 'Avery Prospect',
      email: 'avery@example.com',
      source: 'test',
    })
    .returning();

  const [conversation] = await db
    .insert(conversations)
    .values({
      propertyId: property.id,
      guestCardId: guestCard.id,
      channel: 'website',
      externalId: `web_${Date.now()}`,
      prospectName: 'Avery Prospect',
      prospectEmail: 'avery@example.com',
      status: 'converted',
    })
    .returning();

  await db.insert(tourBookings).values([
    {
      propertyId: property.id,
      guestCardId: guestCard.id,
      conversationId: conversation.id,
      status: 'booked',
      startAt: new Date('2099-04-27T14:00:00.000Z'),
      endAt: new Date('2099-04-27T14:30:00.000Z'),
      timezone: 'America/Chicago',
      source: 'ai_tool',
    },
    {
      propertyId: property.id,
      guestCardId: guestCard.id,
      conversationId: conversation.id,
      status: 'cancelled',
      startAt: new Date('2026-04-20T14:00:00.000Z'),
      endAt: new Date('2026-04-20T14:30:00.000Z'),
      timezone: 'America/Chicago',
      source: 'operator',
    },
  ]);

  return { orgId: org.id };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe('tour dashboard queries', () => {
  it('returns upcoming/past tours with conversion metrics for an org', async () => {
    const seed = await seedTourDashboard();
    try {
      const dashboard = await getTourDashboardForOrg(seed.orgId);

      expect(dashboard.upcomingTours).toHaveLength(1);
      expect(dashboard.upcomingTours[0]).toMatchObject({
        propertyName: 'Sunset Ridge',
        guestCardName: 'Avery Prospect',
        status: 'booked',
      });
      expect(dashboard.pastTours).toHaveLength(1);
      expect(dashboard.pastTours[0].status).toBe('cancelled');
      expect(dashboard.metrics).toMatchObject({
        totalTours: 2,
        upcomingTours: 1,
        completedTours: 0,
        bookingRate: 100,
        completionRate: 0,
      });
    } finally {
      await cleanup(seed.orgId);
    }
  });
});
