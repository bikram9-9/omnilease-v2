import {
  pgTable, uuid, text, timestamp, integer, numeric, jsonb, index, date,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { guestCards } from './guest-cards';
import { properties } from './properties';
import { users } from './tenancy';

export type ConversationChannel = 'messenger' | 'website' | 'phone';
export type ConversationStatus = 'active' | 'escalated' | 'closed' | 'converted';
export type ConversationAutomationState = 'ai_active' | 'human_takeover';
export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageAuthorType = 'ai' | 'human_agent' | 'prospect';
export type EscalationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ModelEventStatus = 'success' | 'error' | 'skipped';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    guestCardId: uuid('guest_card_id').references(() => guestCards.id, { onDelete: 'set null' }),
    channel: text('channel').$type<ConversationChannel>().notNull(),
    externalId: text('external_id').notNull(),
    prospectName: text('prospect_name'),
    prospectEmail: text('prospect_email'),
    prospectPhone: text('prospect_phone'),
    status: text('status').$type<ConversationStatus>().notNull().default('active'),
    automationState: text('automation_state').$type<ConversationAutomationState>().notNull().default('ai_active'),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    escalationReason: text('escalation_reason'),
    assignedAgentId: uuid('assigned_agent_id').references(() => users.id),
    moveInDate: date('move_in_date'),
    unitPreference: text('unit_preference'),
    leadScore: integer('lead_score'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('conversations_property_idx').on(t.propertyId),
    guestCardIdx: index('conversations_guest_card_idx').on(t.guestCardId),
    statusIdx: index('conversations_status_idx').on(t.status),
    automationStateIdx: index('conversations_automation_state_idx').on(t.automationState),
    externalIdx: index('conversations_external_idx').on(t.externalId),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').$type<MessageRole>().notNull(),
    authorType: text('author_type').$type<MessageAuthorType>().notNull().default('ai'),
    content: text('content').notNull(),
    channel: text('channel').$type<ConversationChannel>().notNull(),
    tokensUsed: integer('tokens_used'),
    llmCost: numeric('llm_cost', { precision: 10, scale: 6 }),
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
    toolCalls: jsonb('tool_calls'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index('messages_conversation_idx').on(t.conversationId),
    createdAtIdx: index('messages_created_at_idx').on(t.createdAt),
  }),
);

export const escalations = pgTable(
  'escalations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    priority: text('priority').$type<EscalationPriority>().notNull().default('normal'),
    assignedTo: uuid('assigned_to').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    openIdx: index('escalations_open_idx').on(t.resolvedAt),
  }),
);

export const conversationModelEvents = pgTable(
  'conversation_model_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    status: text('status').$type<ModelEventStatus>().notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    assistantSettingsVersion: integer('assistant_settings_version'),
    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    toolCalls: jsonb('tool_calls'),
    safetyOutcome: jsonb('safety_outcome').$type<Record<string, unknown>>().notNull().default({}),
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
    intent: text('intent'),
    escalationReason: text('escalation_reason'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index('conversation_model_events_conversation_idx').on(t.conversationId),
    propertyIdx: index('conversation_model_events_property_idx').on(t.propertyId),
    createdAtIdx: index('conversation_model_events_created_at_idx').on(t.createdAt),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Escalation = typeof escalations.$inferSelect;
export type NewEscalation = typeof escalations.$inferInsert;
export type ConversationModelEvent = typeof conversationModelEvents.$inferSelect;
export type NewConversationModelEvent = typeof conversationModelEvents.$inferInsert;
