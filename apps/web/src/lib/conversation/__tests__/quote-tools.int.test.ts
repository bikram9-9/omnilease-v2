import { describe, expect, it } from 'vitest';
import { db, eq } from '@omnilease/db';
import {
  conversations,
  guestCardActivities,
  guestCards,
  organizations,
  properties,
  unitTypes,
} from '@omnilease/db';
import { buildConversationTools } from '../tools';

const TEST_PREFIX = 'quote-tool-int-';

async function seedQuoteProperty() {
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
      applicationUrl: 'https://apply.example.com/sunset-ridge',
      applicationFee: '75',
      quoteDisclaimer: 'Quote amounts are estimates and subject to approval.',
      recurringFees: [{ label: 'Utility package', amount: 95, required: true }],
      oneTimeFees: [{ label: 'Admin fee', amount: 200, required: true }],
      petFees: [{ label: 'Pet rent', amount: 35, required: false }],
      leasingSpecials: 'One month free on select homes.',
    })
    .returning();

  await db.insert(unitTypes).values({
    propertyId: property.id,
    name: '1BR/1BA',
    bedrooms: 1,
    bathrooms: '1',
    priceMin: '1500',
    priceMax: '1700',
    deposit: '500',
    availableCount: 2,
    isActive: true,
  });

  const [conversation] = await db
    .insert(conversations)
    .values({
      propertyId: property.id,
      channel: 'website',
      externalId: `web_${Date.now()}`,
      prospectName: 'Avery Prospect',
      prospectEmail: 'avery@example.com',
      status: 'active',
    })
    .returning();

  return {
    orgId: org.id,
    propertyId: property.id,
    conversationId: conversation.id,
  };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe('quote conversation tool', () => {
  it('returns a structured quote and records quote/application activity', async () => {
    const seed = await seedQuoteProperty();
    try {
      const tools = buildConversationTools({
        propertyId: seed.propertyId,
        conversationId: seed.conversationId,
      });
      const getQuote = tools.get_quote as unknown as {
        execute: (args: { bedrooms: number; includeApplicationLink: boolean }) => Promise<{
          ok: true;
          estimatedMonthlyTotal: { min: number; max: number; formatted: string };
          estimatedMoveInFees: { amount: number; formatted: string };
          applicationUrl: string | null;
          missing: { rent: boolean; applicationUrl: boolean; disclaimer: boolean };
        }>;
      };

      const quote = await getQuote.execute({ bedrooms: 1, includeApplicationLink: true });

      expect(quote).toMatchObject({
        ok: true,
        estimatedMonthlyTotal: {
          min: 1595,
          max: 1795,
        },
        estimatedMoveInFees: {
          amount: 775,
        },
        applicationUrl: 'https://apply.example.com/sunset-ridge',
        missing: {
          rent: false,
          applicationUrl: false,
          disclaimer: false,
        },
      });

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, seed.conversationId));
      expect(conversation.guestCardId).toBeTruthy();

      const [guestCard] = await db
        .select()
        .from(guestCards)
        .where(eq(guestCards.id, conversation.guestCardId!));
      expect(guestCard.email).toBe('avery@example.com');

      const activities = await db
        .select()
        .from(guestCardActivities)
        .where(eq(guestCardActivities.guestCardId, guestCard.id));
      expect(activities.map((activity) => activity.eventType)).toEqual(
        expect.arrayContaining(['quote', 'application']),
      );
    } finally {
      await cleanup(seed.orgId);
    }
  });
});
