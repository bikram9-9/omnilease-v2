import {
  pgTable, uuid, text, timestamp, integer, numeric, boolean,
  jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './tenancy';

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
    name: text('name').notNull(),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    zip: text('zip'),
    timezone: text('timezone').notNull().default('America/New_York'),
    officeHours: jsonb('office_hours').$type<OfficeHours>(),
    twilioPhone: text('twilio_phone'),
    webchatWidgetId: text('webchat_widget_id').unique(),
    brandColor: text('brand_color'),
    escalationEmail: text('escalation_email'),
    welcomeMessage: text('welcome_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('properties_org_idx').on(t.orgId),
    twilioPhoneIdx: uniqueIndex('properties_twilio_phone_idx').on(t.twilioPhone),
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

export type KnowledgeCategory =
  | 'pricing' | 'pets' | 'parking' | 'amenities' | 'lease_terms'
  | 'move_in_costs' | 'utilities' | 'neighborhood' | 'faqs';

export const propertyKnowledge = pgTable(
  'property_knowledge',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    category: text('category').$type<KnowledgeCategory>().notNull(),
    content: jsonb('content').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyCategoryIdx: uniqueIndex('property_knowledge_property_category_idx').on(
      t.propertyId, t.category,
    ),
  }),
);

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type UnitType = typeof unitTypes.$inferSelect;
export type NewUnitType = typeof unitTypes.$inferInsert;
export type PropertyKnowledge = typeof propertyKnowledge.$inferSelect;
export type NewPropertyKnowledge = typeof propertyKnowledge.$inferInsert;
