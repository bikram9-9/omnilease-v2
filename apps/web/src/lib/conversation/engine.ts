import { generateText, streamText, stepCountIs } from 'ai';
import { db, eq, sql } from '@omnilease/db';
import {
  type ConversationChannel,
  conversationModelEvents,
  conversations as conversationsTable,
  propertyAssistantSettings,
  properties as propertiesTable,
  unitTypes as unitTypesTable,
  messages as messagesTable,
} from '@omnilease/db';
import { normalizeAssistantSettings } from '@/lib/assistant-settings';
import { loadPropertyContext } from '@/lib/property-context';
import { buildSystemPrompt } from './system-prompt';
import { loadHistory } from './history';
import { buildConversationTools } from './tools';
import { applySafetyFilter } from './safety';
import { classifyIntent } from './intent';
import { classifyEscalationTrigger } from './escalation-intent';
import { escalateConversation } from './escalate';
import { getConversationAiGate } from './takeover';
import {
  buildAnswerSourceEvidence,
  classifyUnsupportedWorkflow,
  detectRepeatedCapturedDetailQuestion,
  getAnswerQualityMetadata,
  renderAnswerSourceRules,
  renderCapturedProspectMemory,
  type AnswerQualityGuardrail,
  type CapturedProspectDetails,
} from './answer-quality';
import { DEFAULT_MODEL, PROMPT_VERSION } from './model-config';

export type ProcessConversationInput = {
  conversationId: string;
  propertyId: string;
  inboundText: string;
  channel: ConversationChannel;
};

export type ProcessConversationResult = {
  assistantText: string;
  escalated: boolean;
  intent: string;
  confidence: number;
};

/**
 * Core entry point for non-streaming channels such as Messenger.
 * The website widget uses the streaming variant below.
 */
export async function processConversation(
  input: ProcessConversationInput,
): Promise<ProcessConversationResult> {
  const intent = classifyIntent(input.inboundText);
  const aiGate = await getConversationAiGate(input.conversationId);
  if (aiGate && !aiGate.allowed) {
    return {
      assistantText: '',
      escalated: aiGate.status === 'escalated',
      intent,
      confidence: 0,
    };
  }

  const escalationTrigger = classifyEscalationTrigger(input.inboundText);
  if (escalationTrigger) {
    await escalateConversation({
      conversationId: input.conversationId,
      propertyId: input.propertyId,
      reason: escalationTrigger.reason,
      priority: escalationTrigger.priority,
    });

    await db.insert(messagesTable).values({
      conversationId: input.conversationId,
      role: 'assistant',
      authorType: 'ai',
      content: escalationTrigger.notice,
      channel: input.channel,
      confidenceScore: '1.00',
      metadata: {
        escalationCategory: escalationTrigger.category,
        escalationReason: escalationTrigger.reason,
        model: 'rule_based_escalation_gate',
      },
    });

    return {
      assistantText: escalationTrigger.notice,
      escalated: true,
      intent,
      confidence: 1,
    };
  }

  const promptContext = await loadPromptContext(input.propertyId, input.conversationId);
  const startedAt = Date.now();

  const unsupportedWorkflow = classifyUnsupportedWorkflow(
    input.inboundText,
    promptContext.answerSourceEvidence,
  );
  if (unsupportedWorkflow) {
    await persistAnswerQualityEscalation({
      conversationId: input.conversationId,
      propertyId: input.propertyId,
      channel: input.channel,
      guardrail: unsupportedWorkflow,
      assistantSettingsVersion: promptContext.assistantSettingsVersion,
      intent,
      startedAt,
    });

    return {
      assistantText: unsupportedWorkflow.notice,
      escalated: true,
      intent,
      confidence: unsupportedWorkflow.confidence,
    };
  }

  // 2. Classify intent for the system prompt hint and the return value.
  //    The route handler in Plan 1b (which owns the inbound message row) is
  //    responsible for writing metadata.intent on the row.

  // 3. Build the tools.
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
    model: DEFAULT_MODEL,
    system: `${promptContext.systemPrompt}\n\n${promptContext.memoryPrompt}\n\n${promptContext.answerSourceRules}\n\n[Detected intent: ${intent}]`,
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

  const repeatedDetailGuardrail = detectRepeatedCapturedDetailQuestion(
    safety.text,
    promptContext.capturedDetails,
  );
  if (!escalated && repeatedDetailGuardrail) {
    await escalateConversation({
      conversationId: input.conversationId,
      propertyId: input.propertyId,
      reason: repeatedDetailGuardrail.reason,
      priority: repeatedDetailGuardrail.priority,
    });
    escalated = true;
  }

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

  const finalText = repeatedDetailGuardrail?.notice ?? safety.text;
  const finalConfidence = repeatedDetailGuardrail?.confidence ?? safety.confidence;
  const [message] = await db.insert(messagesTable).values({
    conversationId: input.conversationId,
    role: 'assistant',
    authorType: 'ai',
    content: finalText,
    channel: input.channel,
    confidenceScore: String(finalConfidence),
    toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
    metadata: {
      ...(safety.flagged ? { safety_flag: true } : {}),
      ...(repeatedDetailGuardrail ? getAnswerQualityMetadata(repeatedDetailGuardrail) : {}),
      model: DEFAULT_MODEL,
      promptVersion: PROMPT_VERSION,
      assistantSettingsVersion: promptContext.assistantSettingsVersion,
    },
  }).returning({ id: messagesTable.id });

  await recordModelEvent({
    conversationId: input.conversationId,
    propertyId: input.propertyId,
    messageId: message.id,
    status: 'success',
    intent,
    latencyMs: Date.now() - startedAt,
    assistantSettingsVersion: promptContext.assistantSettingsVersion,
    toolCalls: allToolCalls,
    safety,
    confidence: finalConfidence,
    usage: getUsage(result),
    escalationReason: repeatedDetailGuardrail?.reason ?? (escalated ? 'tool_or_safety_escalation' : null),
    answerQualityGuardrail: repeatedDetailGuardrail,
  });

  return {
    assistantText: finalText,
    escalated,
    intent,
    confidence: finalConfidence,
  };
}

// ---------------------------------------------------------------------------
// Streaming variant for the webchat widget.
// ---------------------------------------------------------------------------

export type StreamConversationInput = {
  conversationId: string;
  propertyId: string;
  inboundText: string;
  channel: ConversationChannel;
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
  const promptContext = await loadPromptContext(input.propertyId, input.conversationId);

  const intent = classifyIntent(input.inboundText);

  const unsupportedWorkflow = classifyUnsupportedWorkflow(
    input.inboundText,
    promptContext.answerSourceEvidence,
  );
  if (unsupportedWorkflow) {
    await persistAnswerQualityEscalation({
      conversationId: input.conversationId,
      propertyId: input.propertyId,
      channel: input.channel,
      guardrail: unsupportedWorkflow,
      assistantSettingsVersion: promptContext.assistantSettingsVersion,
      intent,
      startedAt: Date.now(),
    });

    return new Response(
      `data: ${JSON.stringify({ type: 'text-delta', delta: unsupportedWorkflow.notice })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
  }

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
    model: DEFAULT_MODEL,
    system: `${promptContext.systemPrompt}\n\n${promptContext.memoryPrompt}\n\n${promptContext.answerSourceRules}\n\n[Detected intent: ${intent}]`,
    messages: historyWithNew.map((t) => ({ role: t.role, content: t.content })),
    tools,
    stopWhen: stepCountIs(4),
    onFinish: async (finished) => {
      const startedAt = Date.now();
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
      const repeatedDetailGuardrail = detectRepeatedCapturedDetailQuestion(
        safety.text,
        promptContext.capturedDetails,
      );
      if (!escalated && repeatedDetailGuardrail) {
        await escalateConversation({
          conversationId: input.conversationId,
          propertyId: input.propertyId,
          reason: repeatedDetailGuardrail.reason,
          priority: repeatedDetailGuardrail.priority,
        });
        escalated = true;
      }

      if (!escalated && safety.autoEscalate) {
        await escalateConversation({
          conversationId: input.conversationId,
          propertyId: input.propertyId,
          reason: `Low confidence response (score ${safety.confidence.toFixed(2)})`,
          priority: 'normal',
        });
        escalated = true;
      }

      const allToolCalls = steps.flatMap((s) => s.toolCalls);
      const finalText = repeatedDetailGuardrail?.notice ?? safety.text;
      const finalConfidence = repeatedDetailGuardrail?.confidence ?? safety.confidence;
      const [message] = await db.insert(messagesTable).values({
        conversationId: input.conversationId,
        role: 'assistant',
        authorType: 'ai',
        content: finalText,
        channel: input.channel,
        confidenceScore: String(finalConfidence),
        toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
        metadata: {
          ...(safety.flagged ? { safety_flag: true } : {}),
          ...(repeatedDetailGuardrail ? getAnswerQualityMetadata(repeatedDetailGuardrail) : {}),
          model: DEFAULT_MODEL,
          promptVersion: PROMPT_VERSION,
          assistantSettingsVersion: promptContext.assistantSettingsVersion,
        },
      }).returning({ id: messagesTable.id });

      await recordModelEvent({
        conversationId: input.conversationId,
        propertyId: input.propertyId,
        messageId: message.id,
        status: 'success',
        intent,
        latencyMs: Date.now() - startedAt,
        assistantSettingsVersion: promptContext.assistantSettingsVersion,
        toolCalls: allToolCalls,
        safety,
        confidence: finalConfidence,
        usage: getUsage(finished),
        escalationReason: repeatedDetailGuardrail?.reason ?? (escalated ? 'tool_or_safety_escalation' : null),
        answerQualityGuardrail: repeatedDetailGuardrail,
      });
    },
  });

  return result.toUIMessageStreamResponse();
}

async function loadPromptContext(propertyId: string, conversationId: string) {
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, propertyId))
    .limit(1);
  if (!property) throw new Error(`property not found: ${propertyId}`);

  const units = await db
    .select()
    .from(unitTypesTable)
    .where(eq(unitTypesTable.propertyId, propertyId));

  const [settingsRow] = await db
    .select()
    .from(propertyAssistantSettings)
    .where(eq(propertyAssistantSettings.propertyId, propertyId))
    .limit(1);

  const assistantSettings = normalizeAssistantSettings(settingsRow);
  const contextSections = await loadPropertyContext(property.slug, property.id);
  const [conversation] = await db
    .select({
      prospectName: conversationsTable.prospectName,
      prospectEmail: conversationsTable.prospectEmail,
      prospectPhone: conversationsTable.prospectPhone,
      moveInDate: conversationsTable.moveInDate,
      unitPreference: conversationsTable.unitPreference,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  const capturedDetails: CapturedProspectDetails = {
    prospectName: conversation?.prospectName ?? null,
    prospectEmail: conversation?.prospectEmail ?? null,
    prospectPhone: conversation?.prospectPhone ?? null,
    moveInDate: conversation?.moveInDate ?? null,
    unitPreference: conversation?.unitPreference ?? null,
  };

  const answerSourceEvidence = buildAnswerSourceEvidence({
    activeUnitCount: units.filter((unit) => unit.isActive).length,
    contextSections,
    hasStructuredQuoteData: hasStructuredQuoteData(property, units),
    hasStructuredApplicationData: Boolean(property.applicationUrl),
    hasStructuredFeeData: hasStructuredFeeData(property, units),
  });

  const systemPrompt = buildSystemPrompt({
    property: {
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      timezone: property.timezone,
      officeHours: property.officeHours ?? null,
      welcomeMessage: property.welcomeMessage,
      applicationUrl: property.applicationUrl,
      applicationFee: property.applicationFee,
      quoteDisclaimer: property.quoteDisclaimer,
      leasingSpecials: property.leasingSpecials,
      recurringFees: property.recurringFees,
      oneTimeFees: property.oneTimeFees,
      petFees: property.petFees,
      parkingFees: property.parkingFees,
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
      recurringFees: u.recurringFees,
      oneTimeFees: u.oneTimeFees,
      specials: u.specials,
      quoteDisclaimer: u.quoteDisclaimer,
      description: u.description,
      isActive: u.isActive,
    })),
    contextSections,
    assistantSettings,
  });

  return {
    property,
    systemPrompt,
    assistantSettingsVersion: assistantSettings.version,
    capturedDetails,
    memoryPrompt: renderCapturedProspectMemory(capturedDetails),
    answerSourceEvidence,
    answerSourceRules: renderAnswerSourceRules(answerSourceEvidence),
  };
}

function hasStructuredQuoteData(
  property: typeof propertiesTable.$inferSelect,
  units: Array<typeof unitTypesTable.$inferSelect>,
) {
  return units.some((unit) => unit.isActive && Boolean(unit.priceMin))
    && (hasStructuredFeeData(property, units) || Boolean(property.applicationUrl) || Boolean(property.quoteDisclaimer));
}

function hasStructuredFeeData(
  property: typeof propertiesTable.$inferSelect,
  units: Array<typeof unitTypesTable.$inferSelect>,
) {
  return Boolean(property.applicationFee)
    || property.recurringFees.length > 0
    || property.oneTimeFees.length > 0
    || property.petFees.length > 0
    || property.parkingFees.length > 0
    || units.some((unit) => (
      Boolean(unit.deposit)
      || unit.recurringFees.length > 0
      || unit.oneTimeFees.length > 0
    ));
}

type UsageShape = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
};

function getUsage(value: unknown): UsageShape | undefined {
  const maybeUsage = (value as { usage?: UsageShape }).usage;
  return maybeUsage;
}

async function recordModelEvent(input: {
  conversationId: string;
  propertyId: string;
  messageId: string | null;
  status: 'success' | 'error' | 'skipped';
  intent: string | null;
  latencyMs: number | null;
  assistantSettingsVersion: number | null;
  toolCalls: unknown[];
  safety: { confidence: number; flagged: boolean; autoEscalate: boolean };
  confidence: number | null;
  usage?: UsageShape;
  escalationReason: string | null;
  answerQualityGuardrail?: AnswerQualityGuardrail | null;
  errorMessage?: string | null;
}) {
  const inputTokens = input.usage?.inputTokens ?? input.usage?.promptTokens ?? null;
  const outputTokens = input.usage?.outputTokens ?? input.usage?.completionTokens ?? null;
  const totalTokens = input.usage?.totalTokens
    ?? (typeof inputTokens === 'number' && typeof outputTokens === 'number' ? inputTokens + outputTokens : null);

  await db.insert(conversationModelEvents).values({
    conversationId: input.conversationId,
    propertyId: input.propertyId,
    messageId: input.messageId,
    status: input.status,
    model: DEFAULT_MODEL,
    promptVersion: PROMPT_VERSION,
    assistantSettingsVersion: input.assistantSettingsVersion,
    latencyMs: input.latencyMs,
    inputTokens,
    outputTokens,
    totalTokens,
    toolCalls: input.toolCalls.length > 0 ? input.toolCalls : null,
    safetyOutcome: {
      flagged: input.safety.flagged,
      autoEscalate: input.safety.autoEscalate,
    },
    confidenceScore: input.confidence === null ? null : String(input.confidence),
    intent: input.intent,
    escalationReason: input.escalationReason,
    errorMessage: input.errorMessage ?? null,
    metadata: input.answerQualityGuardrail
      ? getAnswerQualityMetadata(input.answerQualityGuardrail)
      : {},
  });

  const answerQualityMetadata = input.answerQualityGuardrail
    ? {
        lastAnswerQualityReview: {
          category: input.answerQualityGuardrail.category,
          reason: input.answerQualityGuardrail.reason,
          confidence: input.answerQualityGuardrail.confidence,
          routedToHuman: true,
          reviewedAt: new Date().toISOString(),
        },
      }
    : {};

  await db
    .update(conversationsTable)
    .set({
      metadata: sql`coalesce(${conversationsTable.metadata}, '{}'::jsonb) || ${JSON.stringify({
        model: DEFAULT_MODEL,
        promptVersion: PROMPT_VERSION,
        assistantSettingsVersion: input.assistantSettingsVersion,
        lastModelEventStatus: input.status,
        ...answerQualityMetadata,
      })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, input.conversationId));
}

async function persistAnswerQualityEscalation(input: {
  conversationId: string;
  propertyId: string;
  channel: ConversationChannel;
  guardrail: AnswerQualityGuardrail;
  assistantSettingsVersion: number | null;
  intent: string | null;
  startedAt: number;
}) {
  await escalateConversation({
    conversationId: input.conversationId,
    propertyId: input.propertyId,
    reason: input.guardrail.reason,
    priority: input.guardrail.priority,
  });

  const [message] = await db.insert(messagesTable).values({
    conversationId: input.conversationId,
    role: 'assistant',
    authorType: 'ai',
    content: input.guardrail.notice,
    channel: input.channel,
    confidenceScore: String(input.guardrail.confidence),
    metadata: {
      ...getAnswerQualityMetadata(input.guardrail),
      model: 'answer_quality_guardrail',
      promptVersion: PROMPT_VERSION,
      assistantSettingsVersion: input.assistantSettingsVersion,
    },
  }).returning({ id: messagesTable.id });

  await recordModelEvent({
    conversationId: input.conversationId,
    propertyId: input.propertyId,
    messageId: message.id,
    status: 'skipped',
    intent: input.intent,
    latencyMs: Date.now() - input.startedAt,
    assistantSettingsVersion: input.assistantSettingsVersion,
    toolCalls: [],
    safety: { confidence: input.guardrail.confidence, flagged: false, autoEscalate: true },
    confidence: input.guardrail.confidence,
    escalationReason: input.guardrail.reason,
    answerQualityGuardrail: input.guardrail,
  });
}
