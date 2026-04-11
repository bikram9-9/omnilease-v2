import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { properties } from './properties';

export type OptOutKeyword = 'STOP' | 'UNSUBSCRIBE' | 'CANCEL' | 'END' | 'QUIT';
export type ConsentSource = 'first_contact' | 'manual' | 'widget';

export const smsOptOuts = pgTable(
  'sms_opt_outs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    keyword: text('keyword').$type<OptOutKeyword>(),
    optedOutAt: timestamp('opted_out_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyPhoneIdx: uniqueIndex('sms_opt_outs_property_phone_idx').on(t.propertyId, t.phone),
  }),
);

export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    source: text('source').$type<ConsentSource>().notNull(),
    consentText: text('consent_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyPhoneIdx: uniqueIndex('consent_records_property_phone_idx').on(t.propertyId, t.phone),
  }),
);

export type SmsOptOut = typeof smsOptOuts.$inferSelect;
export type NewSmsOptOut = typeof smsOptOuts.$inferInsert;
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type NewConsentRecord = typeof consentRecords.$inferInsert;
