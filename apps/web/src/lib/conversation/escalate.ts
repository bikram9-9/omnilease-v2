import { db, eq } from '@omnilease/db';
import { conversations, escalations, properties } from '@omnilease/db';
import { sendEscalationEmail } from '@/lib/email/resend';

export type EscalateInput = {
  conversationId: string;
  propertyId: string;
  reason: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
};

/**
 * Persist an escalation and fan out the notification. Called by the engine
 * after a tool_use → escalate_to_human, or after the safety filter
 * auto-escalates. Idempotent: calling twice for the same conversation is
 * safe (it just flips status again and writes a second row; the queue UI
 * in Plan 1c groups by conversation).
 */
export async function escalateConversation(input: EscalateInput): Promise<void> {
  // 1. Write the escalation row.
  await db.insert(escalations).values({
    conversationId: input.conversationId,
    reason: input.reason,
    priority: input.priority,
  });

  // 2. Flip the conversation status.
  await db
    .update(conversations)
    .set({
      status: 'escalated',
      escalatedAt: new Date(),
      escalationReason: input.reason,
    })
    .where(eq(conversations.id, input.conversationId));

  // 3. Look up the property for the notification email + prospect label.
  const [context] = await db
    .select({
      propertyName: properties.name,
      escalationEmail: properties.escalationEmail,
      prospectPhone: conversations.prospectPhone,
      prospectEmail: conversations.prospectEmail,
      prospectName: conversations.prospectName,
    })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .where(eq(conversations.id, input.conversationId))
    .limit(1);

  if (!context) return;               // conversation vanished — nothing to do
  if (!context.escalationEmail) return; // property not configured — silent no-op; log in engine

  const prospectLabel =
    context.prospectName ?? context.prospectPhone ?? context.prospectEmail ?? 'unknown prospect';

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const conversationUrl = `${appUrl}/conversations/${input.conversationId}`;

  await sendEscalationEmail({
    to: context.escalationEmail,
    propertyName: context.propertyName,
    prospectLabel,
    reason: input.reason,
    conversationUrl,
  });
}
