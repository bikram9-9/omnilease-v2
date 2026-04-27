import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { properties } from './properties';
import { organizations, users } from './tenancy';

export type GuestCardStatus = 'active' | 'merged' | 'archived';
export type GuestCardStage = 'new' | 'nurturing' | 'tour_scheduled' | 'applied' | 'leased' | 'lost';
export type DuplicateCandidateStatus = 'open' | 'merged' | 'dismissed';
export type GuestCardActivityType =
  | 'conversation'
  | 'tour'
  | 'quote'
  | 'application'
  | 'task'
  | 'note'
  | 'merge'
  | 'integration';

export const guestCards = pgTable(
  'guest_cards',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    primaryPropertyId: uuid('primary_property_id').references(() => properties.id, { onDelete: 'set null' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').$type<GuestCardStatus>().notNull().default('active'),
    stage: text('stage').$type<GuestCardStage>().notNull().default('new'),
    source: text('source').notNull().default('conversation'),
    firstChannel: text('first_channel'),
    fullName: text('full_name'),
    email: text('email'),
    phone: text('phone'),
    normalizedEmail: text('normalized_email'),
    normalizedPhone: text('normalized_phone'),
    normalizedName: text('normalized_name'),
    moveInDate: date('move_in_date'),
    unitPreference: text('unit_preference'),
    emailConsentStatus: text('email_consent_status'),
    smsConsentStatus: text('sms_consent_status'),
    marketingConsentStatus: text('marketing_consent_status'),
    externalIds: jsonb('external_ids').$type<Record<string, string>>().notNull().default({}),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    mergedIntoGuestCardId: uuid('merged_into_guest_card_id'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('guest_cards_org_idx').on(t.orgId),
    propertyIdx: index('guest_cards_primary_property_idx').on(t.primaryPropertyId),
    emailIdx: index('guest_cards_normalized_email_idx').on(t.orgId, t.normalizedEmail),
    phoneIdx: index('guest_cards_normalized_phone_idx').on(t.orgId, t.normalizedPhone),
    nameIdx: index('guest_cards_normalized_name_idx').on(t.orgId, t.normalizedName),
    mergedIntoIdx: index('guest_cards_merged_into_idx').on(t.mergedIntoGuestCardId),
  }),
);

export const guestCardPropertyLinks = pgTable(
  'guest_card_property_links',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    guestCardId: uuid('guest_card_id').notNull().references(() => guestCards.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('conversation'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    guestCardIdx: index('guest_card_property_links_guest_card_idx').on(t.guestCardId),
    propertyIdx: index('guest_card_property_links_property_idx').on(t.propertyId),
    uniqueGuestPropertyIdx: uniqueIndex('guest_card_property_links_unique_idx').on(t.guestCardId, t.propertyId),
  }),
);

export const guestCardDuplicateCandidates = pgTable(
  'guest_card_duplicate_candidates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    primaryGuestCardId: uuid('primary_guest_card_id').notNull().references(() => guestCards.id, { onDelete: 'cascade' }),
    duplicateGuestCardId: uuid('duplicate_guest_card_id').notNull().references(() => guestCards.id, { onDelete: 'cascade' }),
    status: text('status').$type<DuplicateCandidateStatus>().notNull().default('open'),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull().default('0.50'),
    matchReasons: jsonb('match_reasons').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    orgIdx: index('guest_card_duplicate_candidates_org_idx').on(t.orgId),
    primaryIdx: index('guest_card_duplicate_candidates_primary_idx').on(t.primaryGuestCardId),
    duplicateIdx: index('guest_card_duplicate_candidates_duplicate_idx').on(t.duplicateGuestCardId),
    uniquePairIdx: uniqueIndex('guest_card_duplicate_candidates_pair_idx').on(
      t.primaryGuestCardId,
      t.duplicateGuestCardId,
    ),
  }),
);

export const guestCardMergeAudits = pgTable(
  'guest_card_merge_audits',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    sourceGuestCardId: uuid('source_guest_card_id').notNull(),
    targetGuestCardId: uuid('target_guest_card_id').notNull().references(() => guestCards.id, { onDelete: 'cascade' }),
    duplicateCandidateId: uuid('duplicate_candidate_id').references(() => guestCardDuplicateCandidates.id, {
      onDelete: 'set null',
    }),
    mergedBy: uuid('merged_by').references(() => users.id, { onDelete: 'set null' }),
    sourceSnapshot: jsonb('source_snapshot').$type<Record<string, unknown>>().notNull(),
    targetSnapshot: jsonb('target_snapshot').$type<Record<string, unknown>>().notNull(),
    reversible: boolean('reversible').notNull().default(true),
    mergedAt: timestamp('merged_at', { withTimezone: true }).notNull().defaultNow(),
    revertedAt: timestamp('reverted_at', { withTimezone: true }),
    revertedBy: uuid('reverted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    orgIdx: index('guest_card_merge_audits_org_idx').on(t.orgId),
    sourceIdx: index('guest_card_merge_audits_source_idx').on(t.sourceGuestCardId),
    targetIdx: index('guest_card_merge_audits_target_idx').on(t.targetGuestCardId),
  }),
);

export const guestCardActivities = pgTable(
  'guest_card_activities',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    guestCardId: uuid('guest_card_id').notNull().references(() => guestCards.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id'),
    eventType: text('event_type').$type<GuestCardActivityType>().notNull(),
    title: text('title').notNull(),
    description: text('description'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    guestCardIdx: index('guest_card_activities_guest_card_idx').on(t.guestCardId),
    propertyIdx: index('guest_card_activities_property_idx').on(t.propertyId),
    conversationIdx: index('guest_card_activities_conversation_idx').on(t.conversationId),
    occurredAtIdx: index('guest_card_activities_occurred_at_idx').on(t.occurredAt),
  }),
);

export type GuestCard = typeof guestCards.$inferSelect;
export type NewGuestCard = typeof guestCards.$inferInsert;
export type GuestCardPropertyLink = typeof guestCardPropertyLinks.$inferSelect;
export type NewGuestCardPropertyLink = typeof guestCardPropertyLinks.$inferInsert;
export type GuestCardDuplicateCandidate = typeof guestCardDuplicateCandidates.$inferSelect;
export type NewGuestCardDuplicateCandidate = typeof guestCardDuplicateCandidates.$inferInsert;
export type GuestCardMergeAudit = typeof guestCardMergeAudits.$inferSelect;
export type NewGuestCardMergeAudit = typeof guestCardMergeAudits.$inferInsert;
export type GuestCardActivity = typeof guestCardActivities.$inferSelect;
export type NewGuestCardActivity = typeof guestCardActivities.$inferInsert;
