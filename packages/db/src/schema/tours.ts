import {
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { conversations } from './conversations';
import { guestCards } from './guest-cards';
import { properties, type TourType } from './properties';

export type TourBookingStatus = 'booked' | 'completed' | 'cancelled' | 'no_show' | 'converted';
export type TourBookingSource = 'ai_tool' | 'operator';
export type TourOwnerAssignmentStatus =
  | 'assigned'
  | 'fallback_assigned'
  | 'manual_required'
  | 'unassigned';
export type TourNotificationJobType = 'tour_confirmation' | 'tour_reminder' | 'post_tour_follow_up';
export type TourNotificationRecipientKind = 'prospect' | 'leasing_team' | 'dashboard_task';
export type TourNotificationChannel = 'email' | 'dashboard_task';
export type TourNotificationJobStatus = 'pending' | 'sent' | 'suppressed' | 'failed';

export const tourOwners = pgTable(
  'tour_owners',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    isActive: integer('is_active').notNull().default(1),
    tourTypes: jsonb('tour_types').$type<TourType[]>().notNull().default(['in_person']),
    calendarProvider: text('calendar_provider').notNull().default('none'),
    calendarId: text('calendar_id'),
    assignmentPriority: integer('assignment_priority').notNull().default(100),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyActiveIdx: index('tour_owners_property_active_idx').on(t.propertyId, t.isActive),
    propertyPriorityIdx: index('tour_owners_property_priority_idx').on(t.propertyId, t.assignmentPriority),
  }),
);

export const tourBookings = pgTable(
  'tour_bookings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    guestCardId: uuid('guest_card_id').references(() => guestCards.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    tourOwnerId: uuid('tour_owner_id').references(() => tourOwners.id, { onDelete: 'set null' }),
    tourType: text('tour_type').$type<TourType>().notNull().default('in_person'),
    status: text('status').$type<TourBookingStatus>().notNull().default('booked'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull(),
    source: text('source').$type<TourBookingSource>().notNull().default('ai_tool'),
    ownerAssignmentStatus: text('owner_assignment_status')
      .$type<TourOwnerAssignmentStatus>()
      .notNull()
      .default('unassigned'),
    ownerAssignmentReason: text('owner_assignment_reason'),
    calendarProvider: text('calendar_provider'),
    calendarId: text('calendar_id'),
    calendarEventId: text('calendar_event_id'),
    rescheduledAt: timestamp('rescheduled_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyStartIdx: index('tour_bookings_property_start_idx').on(t.propertyId, t.startAt),
    guestCardIdx: index('tour_bookings_guest_card_idx').on(t.guestCardId),
    conversationIdx: index('tour_bookings_conversation_idx').on(t.conversationId),
    ownerIdx: index('tour_bookings_owner_idx').on(t.tourOwnerId),
    statusIdx: index('tour_bookings_status_idx').on(t.status),
  }),
);

export const tourNotificationJobs = pgTable(
  'tour_notification_jobs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tourBookingId: uuid('tour_booking_id').notNull().references(() => tourBookings.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    guestCardId: uuid('guest_card_id').references(() => guestCards.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    jobType: text('job_type').$type<TourNotificationJobType>().notNull(),
    recipientKind: text('recipient_kind').$type<TourNotificationRecipientKind>().notNull(),
    channel: text('channel').$type<TourNotificationChannel>().notNull(),
    status: text('status').$type<TourNotificationJobStatus>().notNull().default('pending'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastError: text('last_error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bookingIdx: index('tour_notification_jobs_booking_idx').on(t.tourBookingId),
    dueIdx: index('tour_notification_jobs_due_idx').on(t.status, t.nextAttemptAt),
    propertyRunIdx: index('tour_notification_jobs_property_run_idx').on(t.propertyId, t.runAt),
    uniqueBookingJobIdx: uniqueIndex('tour_notification_jobs_unique_booking_job_idx').on(
      t.tourBookingId,
      t.jobType,
      t.recipientKind,
    ),
  }),
);

export type TourBooking = typeof tourBookings.$inferSelect;
export type NewTourBooking = typeof tourBookings.$inferInsert;
export type TourOwner = typeof tourOwners.$inferSelect;
export type NewTourOwner = typeof tourOwners.$inferInsert;
export type TourNotificationJob = typeof tourNotificationJobs.$inferSelect;
export type NewTourNotificationJob = typeof tourNotificationJobs.$inferInsert;
