import { z } from 'zod';
import { tool } from 'ai';
import { db, eq, and, lte, sql } from '@omnilease/db';
import { conversations, unitTypes } from '@omnilease/db';
import { syncGuestCardForConversation } from '@/lib/guest-cards/service';

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
