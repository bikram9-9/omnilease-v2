import { z } from 'zod';
import { tool } from 'ai';
import { db, eq, and, lte, sql } from '@omnilease/db';
import { conversations, guestCardActivities, properties, unitTypes } from '@omnilease/db';
import { syncGuestCardForConversation } from '@/lib/guest-cards/service';
import { buildQuote, formatMoney } from '@/lib/quote-fees';
import {
  bookTourForConversation,
  cancelTourForConversation,
  listTourSlotsForConversation,
  rescheduleTourForConversation,
} from '@/lib/tour-bookings';

export type ConversationToolContext = {
  conversationId: string;
  propertyId: string;
};

/**
 * Build the tool set for a single conversation turn. Tools close over the
 * conversation context so they can write to the right rows without taking
 * the id on every call.
 *
 * Returned tools are AI SDK v6 tools — they use `inputSchema` (not v5's
 * `parameters`).
 */
export function buildConversationTools(ctx: ConversationToolContext) {
  return {
    collect_prospect_info: tool({
      description:
        "Save what you've learned about the prospect. Call this whenever you pick up the prospect's name, email, phone, desired move-in date, or unit preference — once per piece of info is fine.",
      inputSchema: z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        moveInDate: z.string().optional(), // ISO yyyy-mm-dd
        unitPreference: z.string().optional(),
      }),
      execute: async (args) => {
        const update: Record<string, unknown> = {};
        if (args.name) update.prospectName = args.name;
        if (args.email) update.prospectEmail = args.email;
        if (args.phone) update.prospectPhone = args.phone;
        if (args.moveInDate) update.moveInDate = args.moveInDate;
        if (args.unitPreference) update.unitPreference = args.unitPreference;
        if (Object.keys(update).length === 0) return { ok: true, saved: 0 };
        await db
          .update(conversations)
          .set({ ...update, updatedAt: new Date() })
          .where(eq(conversations.id, ctx.conversationId));
        const [conversation] = await db
          .select({
            channel: conversations.channel,
            externalId: conversations.externalId,
          })
          .from(conversations)
          .where(eq(conversations.id, ctx.conversationId))
          .limit(1);
        if (conversation) {
          await syncGuestCardForConversation({
            conversationId: ctx.conversationId,
            propertyId: ctx.propertyId,
            channel: conversation.channel,
            externalId: conversation.externalId,
            source: 'collect_prospect_info',
            name: args.name,
            email: args.email,
            phone: args.phone,
            moveInDate: args.moveInDate,
            unitPreference: args.unitPreference,
          });
        }
        return { ok: true, saved: Object.keys(update).length };
      },
    }),

    check_availability: tool({
      description:
        "Return currently available unit types at this property, optionally filtered by bedrooms or max monthly price. Use the result to give the prospect a specific answer.",
      inputSchema: z.object({
        bedrooms: z.number().int().min(0).max(10).optional(),
        maxPrice: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        const conditions = [
          eq(unitTypes.propertyId, ctx.propertyId),
          eq(unitTypes.isActive, true),
          sql`${unitTypes.availableCount} > 0`,
        ];
        if (typeof args.bedrooms === 'number') conditions.push(eq(unitTypes.bedrooms, args.bedrooms));
        if (typeof args.maxPrice === 'number') conditions.push(lte(unitTypes.priceMin, String(args.maxPrice)));

        const rows = await db
          .select({
            name: unitTypes.name,
            bedrooms: unitTypes.bedrooms,
            bathrooms: unitTypes.bathrooms,
            priceMin: unitTypes.priceMin,
            priceMax: unitTypes.priceMax,
            availableCount: unitTypes.availableCount,
          })
          .from(unitTypes)
          .where(and(...conditions));

        return { units: rows };
      },
    }),

    get_quote: tool({
      description:
        "Return an MVP quote estimate, structured fee breakdown, specials, disclaimers, and application link from configured property/unit data. Call before giving total monthly cost, move-in fee totals, deposits, fee breakdowns, specials, or application links.",
      inputSchema: z.object({
        bedrooms: z.number().int().min(0).max(10).optional(),
        unitTypeName: z.string().optional(),
        includeApplicationLink: z.boolean().default(false),
      }),
      execute: async (args) => {
        const [property] = await db
          .select()
          .from(properties)
          .where(eq(properties.id, ctx.propertyId))
          .limit(1);
        if (!property) return { ok: false, code: 'property_not_found' };

        const conditions = [
          eq(unitTypes.propertyId, ctx.propertyId),
          eq(unitTypes.isActive, true),
        ];
        if (typeof args.bedrooms === 'number') conditions.push(eq(unitTypes.bedrooms, args.bedrooms));
        if (args.unitTypeName) {
          conditions.push(sql`lower(${unitTypes.name}) = lower(${args.unitTypeName})`);
        }
        const units = await db
          .select()
          .from(unitTypes)
          .where(and(...conditions))
          .orderBy(unitTypes.bedrooms, unitTypes.priceMin)
          .limit(1);
        const unit = units[0] ?? null;
        const quote = buildQuote({ property, unit });
        await recordQuoteActivity(ctx, {
          quote,
          includeApplicationLink: args.includeApplicationLink,
        });

        return {
          ok: true,
          unit: unit ? {
            id: unit.id,
            name: unit.name,
            bedrooms: unit.bedrooms,
            bathrooms: unit.bathrooms,
          } : null,
          rentRange: quote.baseRentMin === null
            ? null
            : {
                min: quote.baseRentMin,
                max: quote.baseRentMax,
                formatted: quote.baseRentMin === quote.baseRentMax
                  ? formatMoney(quote.baseRentMin)
                  : `${formatMoney(quote.baseRentMin)}-${formatMoney(quote.baseRentMax)}`,
              },
          monthlyFees: quote.monthlyFees,
          oneTimeFees: quote.oneTimeFees,
          estimatedMonthlyTotal: quote.estimatedMonthlyMin === null
            ? null
            : {
                min: quote.estimatedMonthlyMin,
                max: quote.estimatedMonthlyMax,
                formatted: quote.estimatedMonthlyMin === quote.estimatedMonthlyMax
                  ? formatMoney(quote.estimatedMonthlyMin)
                  : `${formatMoney(quote.estimatedMonthlyMin)}-${formatMoney(quote.estimatedMonthlyMax)}`,
              },
          estimatedMoveInFees: {
            amount: quote.estimatedMoveInFees,
            formatted: formatMoney(quote.estimatedMoveInFees),
          },
          applicationUrl: args.includeApplicationLink ? quote.applicationUrl : null,
          specials: quote.specials,
          disclaimers: quote.disclaimers,
          missing: quote.missing,
          guidance: quote.missing.rent || quote.missing.disclaimer
            ? 'Estimate is incomplete. State uncertainty and offer a leasing specialist for a firm quote.'
            : 'Use this as an MVP estimate and include the configured disclaimer.',
        };
      },
    }),

    get_tour_slots: tool({
      description:
        "Fetch currently available tour slots for this property. Call this before offering exact tour times or before booking/rescheduling a selected slot.",
      inputSchema: z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        tourType: z.enum(['in_person', 'virtual', 'self_guided']).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async (args) => listTourSlotsForConversation(ctx, args),
    }),

    book_tour: tool({
      description:
        "Book a tour after the prospect chooses an available slot and has provided their name plus an email or phone number. Re-checks availability and fails safely if the slot is stale.",
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        tourType: z.enum(['in_person', 'virtual', 'self_guided']).optional(),
        prospectName: z.string().optional(),
        prospectEmail: z.string().email().optional(),
        prospectPhone: z.string().optional(),
      }),
      execute: async (args) => bookTourForConversation(ctx, args),
    }),

    reschedule_tour: tool({
      description:
        "Move an existing tour booking to a newly selected available slot. Re-checks availability and updates the same booking record.",
      inputSchema: z.object({
        bookingId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        tourType: z.enum(['in_person', 'virtual', 'self_guided']).optional(),
      }),
      execute: async (args) => rescheduleTourForConversation(ctx, args),
    }),

    cancel_tour: tool({
      description:
        "Cancel an existing tour booking for this conversation. Use when the prospect asks to cancel or cannot make the tour.",
      inputSchema: z.object({
        bookingId: z.string().uuid(),
        reason: z.string().optional(),
      }),
      execute: async (args) => cancelTourForConversation(ctx, args),
    }),

    escalate_to_human: tool({
      description:
        "Escalate the conversation to a human leasing agent. Call this when the prospect asks for a human, on fair housing / legal / complaint / pricing negotiation topics, or if you don't have enough info to answer confidently.",
      inputSchema: z.object({
        reason: z.string(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      }),
      execute: async (args) => {
        // The actual escalation side-effect (writing the escalations row,
        // sending the Resend email) is handled in escalate.ts, invoked by
        // engine.ts after the LLM call finishes — not inside the tool — so
        // this execute just records intent.
        return {
          escalated: true,
          reason: args.reason,
          priority: args.priority,
          acknowledgement:
            "Got it — one of our team members will follow up with you shortly. Anything else I can help with in the meantime?",
        };
      },
    }),
  };
}

async function recordQuoteActivity(
  ctx: ConversationToolContext,
  input: {
    quote: ReturnType<typeof buildQuote>;
    includeApplicationLink: boolean;
  },
) {
  const [conversation] = await db
    .select({
      guestCardId: conversations.guestCardId,
      channel: conversations.channel,
      externalId: conversations.externalId,
      prospectName: conversations.prospectName,
      prospectEmail: conversations.prospectEmail,
      prospectPhone: conversations.prospectPhone,
      moveInDate: conversations.moveInDate,
      unitPreference: conversations.unitPreference,
    })
    .from(conversations)
    .where(eq(conversations.id, ctx.conversationId))
    .limit(1);
  if (!conversation) return;

  const synced = await syncGuestCardForConversation({
    conversationId: ctx.conversationId,
    propertyId: ctx.propertyId,
    channel: conversation.channel,
    externalId: conversation.externalId,
    source: 'quote_tool',
    name: conversation.prospectName,
    email: conversation.prospectEmail,
    phone: conversation.prospectPhone,
    moveInDate: conversation.moveInDate,
    unitPreference: conversation.unitPreference,
  });

  await db.insert(guestCardActivities).values({
    guestCardId: synced.guestCardId,
    propertyId: ctx.propertyId,
    conversationId: ctx.conversationId,
    eventType: 'quote',
    title: 'Quote estimate shared by AI assistant',
    metadata: {
      unitName: input.quote.unitName,
      estimatedMonthlyMin: input.quote.estimatedMonthlyMin,
      estimatedMonthlyMax: input.quote.estimatedMonthlyMax,
      estimatedMoveInFees: input.quote.estimatedMoveInFees,
      missing: input.quote.missing,
    },
  });

  if (input.includeApplicationLink && input.quote.applicationUrl) {
    await db.insert(guestCardActivities).values({
      guestCardId: synced.guestCardId,
      propertyId: ctx.propertyId,
      conversationId: ctx.conversationId,
      eventType: 'application',
      title: 'Application link shared by AI assistant',
      metadata: {
        applicationUrl: input.quote.applicationUrl,
        unitName: input.quote.unitName,
      },
    });
  }
}
