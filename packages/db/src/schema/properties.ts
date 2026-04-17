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

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type UnitType = typeof unitTypes.$inferSelect;
export type NewUnitType = typeof unitTypes.$inferInsert;
