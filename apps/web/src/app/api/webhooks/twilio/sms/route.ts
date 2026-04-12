import { after, type NextRequest } from 'next/server';
import { db, eq, and, desc } from '@omnilease/db';
import {
  properties,
  conversations,
  messages,
  consentRecords,
} from '@omnilease/db';
import { verifyTwilioSignature } from '@/lib/twilio/verify';
import { sendSms, OptedOutError, QuietHoursError } from '@/lib/twilio/send';
import { isOptedOut, isStopKeyword, markOptedOut } from '@/lib/tcpa/opt-outs';
import { isDirectReplyWindow } from '@/lib/tcpa/quiet-hours';
import { classifyIntent } from '@/lib/conversation/intent';
import { processConversation } from '@/lib/conversation/engine';

// Route needs up to 5 minutes for the LLM roundtrip + outbound send to happen
// via after(). Twilio gets an immediate ACK — after() work runs independently.
export const maxDuration = 300;

// Text shown to prospects on their very first contact. This is the TCPA
// consent disclosure — it must be delivered before any outbound reply.
const FIRST_CONTACT_DISCLOSURE =
  'Reply STOP to opt out. Msg & data rates may apply.';

const STOP_ACK = 'You have been unsubscribed. No further messages will be sent.';

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Parse x-www-form-urlencoded body (Twilio's format).
  const rawBody = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody)) {
    params[k] = v;
  }

  // 2. Reconstruct the full URL the signature was computed against.
  //    Twilio uses the exact URL it POSTed to, including scheme/host/path/query.
  const appUrl = process.env.APP_URL ?? '';
  const url = appUrl.replace(/\/$/, '') + '/api/webhooks/twilio/sms';

  // 3. Verify the signature.
  const signature = req.headers.get('x-twilio-signature') ?? '';
  if (!verifyTwilioSignature({ signature, url, params })) {
    return new Response('Forbidden', { status: 403 });
  }

  const from = params.From ?? '';
  const to = params.To ?? '';
  const body = (params.Body ?? '').trim();
  if (!from || !to || !body) {
    return twimlOk();
  }

  // 4. Resolve the property by the Twilio number that was dialed.
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.twilioPhone, to))
    .limit(1);

  if (!property) {
    // Unknown number — silently ACK so Twilio stops retrying.
    return twimlOk();
  }

  // 5. Opt-out check: already opted out → silent no-op.
  if (await isOptedOut(property.id, from)) {
    return twimlOk();
  }

  // 6. STOP keyword: record opt-out, send one-time ack, done.
  if (isStopKeyword(body)) {
    await markOptedOut(property.id, from, body.trim().toUpperCase() as 'STOP');
    // Ack outside of quiet-hours enforcement — TCPA permits a single opt-out
    // confirmation. We bypass by passing directReply:true.
    if (property.twilioPhone) {
      try {
        await sendSms({
          propertyId: property.id,
          propertyTimezone: property.timezone,
          from: property.twilioPhone,
          to: from,
          body: STOP_ACK,
          directReply: true,
        });
      } catch {
        // Ignore send failures on the ack — the DB opt-out is what matters.
      }
    }
    return twimlOk();
  }

  // 7. Get or create conversation.
  let conversationId: string;
  {
    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.propertyId, property.id),
          eq(conversations.externalId, from),
          eq(conversations.channel, 'sms'),
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
          channel: 'sms',
          externalId: from,
          prospectPhone: from,
          status: 'active',
        })
        .returning({ id: conversations.id });
      conversationId = created.id;

      // First contact → record consent disclosure snapshot.
      await db
        .insert(consentRecords)
        .values({
          propertyId: property.id,
          phone: from,
          source: 'first_contact',
          consentText: FIRST_CONTACT_DISCLOSURE,
        })
        .onConflictDoNothing({
          target: [consentRecords.propertyId, consentRecords.phone],
        });
    }
  }

  // 8. Insert the inbound message row with detected intent in metadata.
  const intent = classifyIntent(body);
  await db.insert(messages).values({
    conversationId,
    role: 'user',
    authorType: 'prospect',
    content: body,
    channel: 'sms',
    metadata: { intent },
  });

  // 9. ACK Twilio immediately with empty TwiML.
  // 10. Then process the conversation in the background and send the reply.
  after(async () => {
    try {
      const result = await processConversation({
        conversationId,
        propertyId: property.id,
        inboundText: body,
      });

      // Find the last inbound to know if we're in the direct-reply window
      // (which is essentially always right after this webhook runs — the
      // most recent inbound is the one we just inserted).
      const [lastInbound] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.role, 'user'),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const directReply = isDirectReplyWindow(lastInbound?.createdAt ?? null);

      if (property.twilioPhone) {
        await sendSms({
          propertyId: property.id,
          propertyTimezone: property.timezone,
          from: property.twilioPhone,
          to: from,
          body: result.assistantText,
          directReply,
        });
      }
    } catch (err) {
      if (err instanceof OptedOutError || err instanceof QuietHoursError) {
        // Expected — log and swallow.
        console.warn('[twilio/sms] send blocked:', err.message);
        return;
      }
      console.error('[twilio/sms] after() failed:', err);
    }
  });

  return twimlOk();
}

function twimlOk(): Response {
  return new Response('<Response/>', {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  });
}
