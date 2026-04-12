import { generateText, streamText, stepCountIs } from 'ai';
import { db, eq } from '@omnilease/db';
import {
  properties as propertiesTable,
  unitTypes as unitTypesTable,
  propertyKnowledge as propertyKnowledgeTable,
  messages as messagesTable,
} from '@omnilease/db';
import { buildSystemPrompt } from './system-prompt';
import { loadHistory } from './history';
import { buildConversationTools } from './tools';
import { applySafetyFilter } from './safety';
import { classifyIntent } from './intent';
import { escalateConversation } from './escalate';

// Model string format: "<provider>/<model>". AI Gateway routes based on the
// string alone — auth comes from VERCEL_OIDC_TOKEN, provisioned automatically
// by `vercel env pull` when the project is linked and AI Gateway is enabled.
const MODEL = 'anthropic/claude-sonnet-4.6';

export type ProcessConversationInput = {
  conversationId: string;
  propertyId: string;
  inboundText: string;
};

export type ProcessConversationResult = {
  assistantText: string;
  escalated: boolean;
  intent: string;
  confidence: number;
};

/**
 * Core entry point — both the SMS webhook (via `after()`) and the widget
 * route call this. The widget path uses a streaming variant implemented
 * separately in Plan 1b; this function is for the non-streaming case.
 */
export async function processConversation(
  input: ProcessConversationInput,
): Promise<ProcessConversationResult> {
  // 1. Load everything needed for the system prompt.
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, input.propertyId))
    .limit(1);
  if (!property) throw new Error(`property not found: ${input.propertyId}`);

  const units = await db
    .select()
    .from(unitTypesTable)
    .where(eq(unitTypesTable.propertyId, input.propertyId));

  const knowledge = await db
    .select({
      category: propertyKnowledgeTable.category,
      content: propertyKnowledgeTable.content,
    })
    .from(propertyKnowledgeTable)
    .where(eq(propertyKnowledgeTable.propertyId, input.propertyId));

  // 2. Classify intent for the system prompt hint and the return value.
  //    The route handler in Plan 1b (which owns the inbound message row) is
  //    responsible for writing metadata.intent on the row.
  const intent = classifyIntent(input.inboundText);

  // 3. Build the prompt + tools.
  const systemPrompt = buildSystemPrompt({
    property: {
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      timezone: property.timezone,
      officeHours: property.officeHours ?? null,
      welcomeMessage: property.welcomeMessage,
    },
    unitTypes: units.map((u) => ({
      name: u.name,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      sqftMin: u.sqftMin,
      sqftMax: u.sqftMax,
      priceMin: u.priceMin,
      priceMax: u.priceMax,
      availableCount: u.availableCount,
      deposit: u.deposit,
      description: u.description,
      isActive: u.isActive,
    })),
    knowledge: knowledge.map((k) => ({ category: k.category, content: k.content })),
  });

  const tools = buildConversationTools({
    conversationId: input.conversationId,
    propertyId: input.propertyId,
  });

  // 4. Load prior history and append the new inbound.
  const history = await loadHistory(input.conversationId, 20);
  const historyWithNew: typeof history = [
    ...history,
    { role: 'user', content: input.inboundText },
  ];

  // 5. Call the model via AI Gateway. generateText accepts ModelMessage-shaped
  //    objects directly — no need for convertToModelMessages (that helper is
  //    for UIMessages coming from useChat).
  const result = await generateText({
    model: MODEL,
    system: `${systemPrompt}\n\n[Detected intent: ${intent}]`,
    messages: historyWithNew.map((t) => ({ role: t.role, content: t.content })),
    tools,
    stopWhen: stepCountIs(4),
  });

  // 6. Handle escalation side-effect: if the model called escalate_to_human,
  //    invoke the real escalation pipeline (writes row, sends email).
  let escalated = false;
  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      if (call.toolName === 'escalate_to_human') {
        const args = call.input as { reason: string; priority: 'low' | 'normal' | 'high' | 'urgent' };
        await escalateConversation({
          conversationId: input.conversationId,
          propertyId: input.propertyId,
          reason: args.reason,
          priority: args.priority,
        });
        escalated = true;
      }
    }
  }

  // 7. Run the final text through the safety filter.
  const safety = applySafetyFilter(result.text);

  // 8. Auto-escalate on low confidence, if not already escalated.
  if (!escalated && safety.autoEscalate) {
    await escalateConversation({
      conversationId: input.conversationId,
      propertyId: input.propertyId,
      reason: `Low confidence response (score ${safety.confidence.toFixed(2)})`,
      priority: 'normal',
    });
    escalated = true;
  }

  // 9. Persist the assistant turn.
  // toolCalls serialised as JSON — each step's calls are flatted into one array.
  const allToolCalls = result.steps.flatMap((s) => s.toolCalls);

  await db.insert(messagesTable).values({
    conversationId: input.conversationId,
    role: 'assistant',
    authorType: 'ai',
    content: safety.text,
    channel: 'sms', // overwritten by widget-specific path in Plan 1b
    confidenceScore: String(safety.confidence),
    toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
    metadata: safety.flagged ? { safety_flag: true } : null,
  });

  return {
    assistantText: safety.text,
    escalated,
    intent,
    confidence: safety.confidence,
  };
}

// ---------------------------------------------------------------------------
// Streaming variant for the webchat widget.
// ---------------------------------------------------------------------------

export type StreamConversationInput = {
  conversationId: string;
  propertyId: string;
  inboundText: string;
};

/**
 * Widget path — same system prompt / tools / history as the non-streaming
 * path, but returns a streaming Response via AI SDK's `toUIMessageStreamResponse`.
 * Side effects (escalation, safety filtering, persistence) happen in the
 * `onFinish` callback after the final text is produced.
 *
 * Note: the streaming path intentionally re-uses the same helpers as
 * `processConversation`. If the two diverge meaningfully, factor out a
 * private `_buildContext` helper. For now the small duplication is clearer
 * than premature abstraction.
 */
export async function streamConversationForWidget(
  input: StreamConversationInput,
): Promise<Response> {
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, input.propertyId))
    .limit(1);
  if (!property) throw new Error(`property not found: ${input.propertyId}`);

  const units = await db
    .select()
    .from(unitTypesTable)
    .where(eq(unitTypesTable.propertyId, input.propertyId));

  const knowledge = await db
    .select({
      category: propertyKnowledgeTable.category,
      content: propertyKnowledgeTable.content,
    })
    .from(propertyKnowledgeTable)
    .where(eq(propertyKnowledgeTable.propertyId, input.propertyId));

  const intent = classifyIntent(input.inboundText);

  const systemPrompt = buildSystemPrompt({
    property: {
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      timezone: property.timezone,
      officeHours: property.officeHours ?? null,
      welcomeMessage: property.welcomeMessage,
    },
    unitTypes: units.map((u) => ({
      name: u.name,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      sqftMin: u.sqftMin,
      sqftMax: u.sqftMax,
      priceMin: u.priceMin,
      priceMax: u.priceMax,
      availableCount: u.availableCount,
      deposit: u.deposit,
      description: u.description,
      isActive: u.isActive,
    })),
    knowledge: knowledge.map((k) => ({ category: k.category, content: k.content })),
  });

  const tools = buildConversationTools({
    conversationId: input.conversationId,
    propertyId: input.propertyId,
  });

  const history = await loadHistory(input.conversationId, 20);
  const historyWithNew: typeof history = [
    ...history,
    { role: 'user', content: input.inboundText },
  ];

  const result = streamText({
    model: MODEL,
    system: `${systemPrompt}\n\n[Detected intent: ${intent}]`,
    messages: historyWithNew.map((t) => ({ role: t.role, content: t.content })),
    tools,
    stopWhen: stepCountIs(4),
    onFinish: async (finished) => {
      const text = finished.text;
      const steps = finished.steps;

      // Fan out escalation side-effects (same as processConversation).
      let escalated = false;
      for (const step of steps) {
        for (const call of step.toolCalls) {
          if (call.toolName === 'escalate_to_human') {
            const args = call.input as {
              reason: string;
              priority: 'low' | 'normal' | 'high' | 'urgent';
            };
            await escalateConversation({
              conversationId: input.conversationId,
              propertyId: input.propertyId,
              reason: args.reason,
              priority: args.priority,
            });
            escalated = true;
          }
        }
      }

      const safety = applySafetyFilter(text);
      if (!escalated && safety.autoEscalate) {
        await escalateConversation({
          conversationId: input.conversationId,
          propertyId: input.propertyId,
          reason: `Low confidence response (score ${safety.confidence.toFixed(2)})`,
          priority: 'normal',
        });
      }

      const allToolCalls = steps.flatMap((s) => s.toolCalls);
      await db.insert(messagesTable).values({
        conversationId: input.conversationId,
        role: 'assistant',
        authorType: 'ai',
        content: safety.text,
        channel: 'webchat',
        confidenceScore: String(safety.confidence),
        toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
        metadata: safety.flagged ? { safety_flag: true } : null,
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
