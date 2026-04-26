import {
  pgTable, uuid, text, timestamp, integer, numeric, boolean,
  jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, users } from './tenancy';

export type OfficeHours = {
  [day in 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun']?: {
    open: string; // "09:00"
    close: string; // "18:00"
  };
};

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    zip: text('zip'),
    timezone: text('timezone').notNull().default('America/New_York'),
    officeHours: jsonb('office_hours').$type<OfficeHours>(),
    websiteWidgetId: text('website_widget_id').unique(),
    messengerPageId: text('messenger_page_id').unique(),
    brandColor: text('brand_color'),
    escalationEmail: text('escalation_email'),
    welcomeMessage: text('welcome_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('properties_org_idx').on(t.orgId),
    slugIdx: uniqueIndex('properties_slug_idx').on(t.slug),
    websiteWidgetIdIdx: uniqueIndex('properties_website_widget_id_idx').on(t.websiteWidgetId),
    messengerPageIdIdx: uniqueIndex('properties_messenger_page_id_idx').on(t.messengerPageId),
  }),
);

export const unitTypes = pgTable(
  'unit_types',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    bedrooms: integer('bedrooms').notNull(),
    bathrooms: numeric('bathrooms', { precision: 3, scale: 1 }).notNull(),
    sqftMin: integer('sqft_min'),
    sqftMax: integer('sqft_max'),
    priceMin: numeric('price_min', { precision: 10, scale: 2 }),
    priceMax: numeric('price_max', { precision: 10, scale: 2 }),
    availableCount: integer('available_count').notNull().default(0),
    deposit: numeric('deposit', { precision: 10, scale: 2 }),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('unit_types_property_idx').on(t.propertyId),
  }),
);

export type PropertyKnowledgeSectionKey = 'overview' | 'amenities' | 'policies' | 'faqs' | 'touring';
export type PropertyKnowledgeStatus = 'draft' | 'published';
export type PropertyKnowledgeSource = 'manual' | 'import';

export const propertyKnowledgeSections = pgTable(
  'property_knowledge_sections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    section: text('section').$type<PropertyKnowledgeSectionKey>().notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    status: text('status').$type<PropertyKnowledgeStatus>().notNull().default('draft'),
    source: text('source').$type<PropertyKnowledgeSource>().notNull().default('manual'),
    importSource: text('import_source'),
    validationWarnings: jsonb('validation_warnings').$type<string[]>().notNull().default([]),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('property_knowledge_sections_property_idx').on(t.propertyId),
    uniquePropertySectionIdx: uniqueIndex('property_knowledge_sections_unique_idx').on(t.propertyId, t.section),
  }),
);

export type AssistantPrimaryGoal = 'answer_questions' | 'qualify_lead' | 'book_tour' | 'route_to_human';
export type AssistantTone = 'warm_professional' | 'concise_direct' | 'luxury_concierge' | 'friendly_casual';
export type AssistantCtaPreference = 'ask_for_tour' | 'ask_for_contact' | 'offer_human' | 'answer_only';
export type TourType = 'in_person' | 'virtual' | 'self_guided';

export const propertyAssistantSettings = pgTable(
  'property_assistant_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    primaryGoal: text('primary_goal').$type<AssistantPrimaryGoal>().notNull().default('book_tour'),
    tone: text('tone').$type<AssistantTone>().notNull().default('warm_professional'),
    ctaPreference: text('cta_preference').$type<AssistantCtaPreference>().notNull().default('ask_for_tour'),
    screeningQuestions: jsonb('screening_questions').$type<string[]>().notNull().default([]),
    sellingPoints: jsonb('selling_points').$type<string[]>().notNull().default([]),
    escalationTriggers: jsonb('escalation_triggers').$type<string[]>().notNull().default([]),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: uniqueIndex('property_assistant_settings_property_idx').on(t.propertyId),
  }),
);

export const propertyTourSettings = pgTable(
  'property_tour_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    enabledTourTypes: jsonb('enabled_tour_types').$type<TourType[]>().notNull().default(['in_person']),
    defaultDurationMinutes: integer('default_duration_minutes').notNull().default(30),
    bufferMinutes: integer('buffer_minutes').notNull().default(15),
    capacityPerSlot: integer('capacity_per_slot').notNull().default(1),
    schedulingWindowDays: integer('scheduling_window_days').notNull().default(14),
    tourHours: jsonb('tour_hours').$type<OfficeHours>().notNull().default({}),
    blackoutDates: jsonb('blackout_dates').$type<string[]>().notNull().default([]),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: uniqueIndex('property_tour_settings_property_idx').on(t.propertyId),
  }),
);

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type UnitType = typeof unitTypes.$inferSelect;
export type NewUnitType = typeof unitTypes.$inferInsert;
export type PropertyKnowledgeSection = typeof propertyKnowledgeSections.$inferSelect;
export type NewPropertyKnowledgeSection = typeof propertyKnowledgeSections.$inferInsert;
export type PropertyAssistantSettings = typeof propertyAssistantSettings.$inferSelect;
export type NewPropertyAssistantSettings = typeof propertyAssistantSettings.$inferInsert;
export type PropertyTourSettings = typeof propertyTourSettings.$inferSelect;
export type NewPropertyTourSettings = typeof propertyTourSettings.$inferInsert;
