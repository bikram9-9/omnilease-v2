import {
  pgTable, uuid, text, timestamp, integer, numeric, jsonb, index, date,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { properties } from './properties';
import { users } from './tenancy';

export type ConversationChannel = 'sms' | 'email' | 'webchat' | 'voice';
export type ConversationStatus = 'active' | 'escalated' | 'closed' | 'converted';
export type MessageRole = 'user' | 'assistant' | 'system';
export type EscalationPriority = 'low' | 'normal' | 'high' | 'urgent';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    channel: text('channel').$type<ConversationChannel>().notNull(),
    externalId: text('external_id').notNull(),
    prospectName: text('prospect_name'),
    prospectEmail: text('prospect_email'),
    prospectPhone: text('prospect_phone'),
    status: text('status').$type<ConversationStatus>().notNull().default('active'),
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
    statusIdx: index('conversations_status_idx').on(t.status),
    externalIdx: index('conversations_external_idx').on(t.externalId),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').$type<MessageRole>().notNull(),
    content: text('content').notNull(),
    channel: text('channel').$type<ConversationChannel>().notNull(),
    tokensUsed: integer('tokens_used'),
    llmCost: numeric('llm_cost', { precision: 10, scale: 6 }),
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
    toolCalls: jsonb('tool_calls'),
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

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Escalation = typeof escalations.$inferSelect;
export type NewEscalation = typeof escalations.$inferInsert;
