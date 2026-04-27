import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, eq } from '@omnilease/db';
import {
  conversations,
  guestCardActivities,
  guestCards,
  organizations,
  properties,
  propertyTourSettings,
  tourBookings,
  tourNotificationJobs,
  tourOwners,
} from '@omnilease/db';
import {
  bookTourForConversation,
  cancelTourForConversation,
  listTourSlotsForConversation,
  rescheduleTourForConversation,
} from '../tour-bookings';
import {
  cancelScheduledTourNotificationForOrg,
  processDueTourNotificationJobs,
} from '../tour-notifications';

const { sendOperationalEmailMock } = vi.hoisted(() => ({
  sendOperationalEmailMock: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({
  sendOperationalEmail: sendOperationalEmailMock,
  sendEscalationEmail: vi.fn(),
}));

const TEST_PREFIX = 'tour-booking-int-';

beforeEach(() => {
  sendOperationalEmailMock.mockReset();
  sendOperationalEmailMock.mockResolvedValue(undefined);
});

async function seedTourProperty(capacityPerSlot = 1) {
  const [org] = await db
    .insert(organizations)
    .values({
      name: `${TEST_PREFIX}org`,
      slug: `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'starter',
    })
    .returning();

  const [property] = await db
    .insert(properties)
    .values({
      orgId: org.id,
      slug: `${TEST_PREFIX}property-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Sunset Ridge',
      address: '123 Main St',
      city: 'Pensacola',
      state: 'FL',
      timezone: 'America/Chicago',
      escalationEmail: 'leasing@example.com',
    })
    .returning();

  await db.insert(propertyTourSettings).values({
    propertyId: property.id,
    enabledTourTypes: ['in_person'],
    defaultDurationMinutes: 30,
    bufferMinutes: 0,
    capacityPerSlot,
    schedulingWindowDays: 7,
    tourHours: { mon: { open: '09:00', close: '10:00' } },
    blackoutDates: [],
  });

  const [tourOwner] = await db.insert(tourOwners).values({
    propertyId: property.id,
    displayName: 'Avery Agent',
    email: 'avery.agent@example.com',
    tourTypes: ['in_person'],
    assignmentPriority: 10,
  }).returning();

  const [conversation] = await db
    .insert(conversations)
    .values({
      propertyId: property.id,
      channel: 'website',
      externalId: `web_${Date.now()}`,
      prospectName: 'Avery Prospect',
      prospectEmail: 'avery@example.com',
      status: 'active',
    })
    .returning();

  return {
    orgId: org.id,
    propertyId: property.id,
    tourOwnerId: tourOwner.id,
    conversationId: conversation.id,
    ctx: { propertyId: property.id, conversationId: conversation.id },
  };
}

async function cleanup(orgId: string) {
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe('tour booking tools', () => {
  it('lists settings-backed slots and books a selected slot into a guest-card-linked tour record', async () => {
    const seed = await seedTourProperty();
    try {
      const slots = await listTourSlotsForConversation(seed.ctx, {
        startDate: '2026-04-27',
        endDate: '2026-04-27',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });

      expect(slots.ok).toBe(true);
      if (!slots.ok) throw new Error(slots.message);
      expect(slots.slots.map((slot) => slot.startTime)).toEqual(['09:00', '09:30']);

      const booked = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });

      expect(booked.ok).toBe(true);
      if (!booked.ok) throw new Error(booked.message);
      expect(booked.booking).toMatchObject({
        date: '2026-04-27',
        startTime: '09:00',
        endTime: '09:30',
        status: 'booked',
        owner: {
          id: seed.tourOwnerId,
          name: 'Avery Agent',
        },
        ownerAssignmentStatus: 'assigned',
      });

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, seed.conversationId));
      expect(conversation.guestCardId).toBeTruthy();
      expect(conversation.status).toBe('converted');

      const [guestCard] = await db
        .select()
        .from(guestCards)
        .where(eq(guestCards.id, conversation.guestCardId!));
      expect(guestCard.stage).toBe('tour_scheduled');

      const activities = await db
        .select()
        .from(guestCardActivities)
        .where(eq(guestCardActivities.guestCardId, guestCard.id));
      expect(activities.some((activity) => activity.title === 'Tour booked by AI assistant')).toBe(true);
      expect(activities.some((activity) => activity.metadata?.tourOwnerId === seed.tourOwnerId)).toBe(true);
      expect(activities.some((activity) => activity.title === 'Tour confirmation sent to prospect')).toBe(true);
      expect(activities.some((activity) => activity.title === 'Tour confirmation sent to leasing team')).toBe(true);

      const notificationJobs = await db
        .select()
        .from(tourNotificationJobs)
        .where(eq(tourNotificationJobs.tourBookingId, booked.booking.id));
      expect(notificationJobs).toHaveLength(4);
      expect(notificationJobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jobType: 'tour_confirmation',
            recipientKind: 'prospect',
            status: 'sent',
          }),
          expect.objectContaining({
            jobType: 'tour_confirmation',
            recipientKind: 'leasing_team',
            status: 'sent',
          }),
          expect.objectContaining({
            jobType: 'tour_reminder',
            recipientKind: 'prospect',
            status: 'pending',
          }),
          expect.objectContaining({
            jobType: 'post_tour_follow_up',
            recipientKind: 'dashboard_task',
            status: 'pending',
          }),
        ]),
      );
      expect(sendOperationalEmailMock).toHaveBeenCalledTimes(2);

      const futureRun = await processDueTourNotificationJobs({
        now: new Date('2026-04-27T17:00:00.000Z'),
        bookingId: booked.booking.id,
      });
      expect(futureRun.sent).toBe(2);

      const afterFutureActivities = await db
        .select()
        .from(guestCardActivities)
        .where(eq(guestCardActivities.guestCardId, guestCard.id));
      expect(afterFutureActivities.some((activity) => activity.title === 'Tour reminder sent to prospect')).toBe(true);
      expect(afterFutureActivities.some((activity) => activity.title === 'Post-tour follow-up due')).toBe(true);
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('suppresses proactive prospect sends when the guest card is opted out', async () => {
    const seed = await seedTourProperty();
    try {
      const [existingGuestCard] = await db
        .insert(guestCards)
        .values({
          orgId: seed.orgId,
          primaryPropertyId: seed.propertyId,
          fullName: 'Avery Prospect',
          email: 'avery@example.com',
          normalizedEmail: 'avery@example.com',
          emailConsentStatus: 'opted_out',
          marketingConsentStatus: 'opted_out',
          source: 'test',
        })
        .returning();

      const booked = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });
      expect(booked.ok).toBe(true);
      if (!booked.ok) throw new Error(booked.message);

      const jobs = await db
        .select()
        .from(tourNotificationJobs)
        .where(eq(tourNotificationJobs.tourBookingId, booked.booking.id));

      expect(jobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jobType: 'tour_confirmation',
            recipientKind: 'prospect',
            status: 'suppressed',
            lastError: 'Prospect is opted out or suppressed for proactive outreach.',
          }),
          expect.objectContaining({
            jobType: 'tour_confirmation',
            recipientKind: 'leasing_team',
            status: 'sent',
          }),
        ]),
      );
      expect(sendOperationalEmailMock).toHaveBeenCalledTimes(1);

      const activities = await db
        .select()
        .from(guestCardActivities)
        .where(eq(guestCardActivities.guestCardId, existingGuestCard.id));
      expect(activities.some((activity) => activity.title === 'Tour confirmation suppressed')).toBe(true);
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('records delivery failures and leaves retryable jobs visible', async () => {
    sendOperationalEmailMock.mockRejectedValueOnce(new Error('provider unavailable'));
    const seed = await seedTourProperty();
    try {
      const booked = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });
      expect(booked.ok).toBe(true);
      if (!booked.ok) throw new Error(booked.message);

      const failedJobs = await db
        .select()
        .from(tourNotificationJobs)
        .where(eq(tourNotificationJobs.tourBookingId, booked.booking.id));
      expect(failedJobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jobType: 'tour_confirmation',
            status: 'failed',
            attempts: 1,
            lastError: 'provider unavailable',
          }),
        ]),
      );

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, seed.conversationId));
      const activities = await db
        .select()
        .from(guestCardActivities)
        .where(eq(guestCardActivities.guestCardId, conversation.guestCardId!));
      expect(activities.some((activity) => activity.title === 'Tour notification delivery failed')).toBe(true);
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('fails safely when a selected slot is already at capacity', async () => {
    const seed = await seedTourProperty(1);
    try {
      const first = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });
      expect(first.ok).toBe(true);
      await db.insert(tourOwners).values({
        propertyId: seed.propertyId,
        displayName: 'Backup Agent',
        tourTypes: ['in_person'],
        assignmentPriority: 20,
      });

      const [secondConversation] = await db
        .insert(conversations)
        .values({
          propertyId: seed.propertyId,
          channel: 'website',
          externalId: `web_second_${Date.now()}`,
          prospectName: 'Jordan Prospect',
          prospectPhone: '555-111-2222',
          status: 'active',
        })
        .returning();

      const second = await bookTourForConversation(
        { propertyId: seed.propertyId, conversationId: secondConversation.id },
        {
          date: '2026-04-27',
          startTime: '09:00',
          now: new Date('2026-04-25T15:00:00.000Z'),
        },
      );

      expect(second).toMatchObject({
        ok: false,
        code: 'slot_unavailable',
      });

      const bookings = await db
        .select()
        .from(tourBookings)
        .where(eq(tourBookings.propertyId, seed.propertyId));
      expect(bookings).toHaveLength(1);
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('blocks owner double-booking even when property slot capacity remains', async () => {
    const seed = await seedTourProperty(2);
    try {
      const first = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });
      expect(first.ok).toBe(true);

      const [secondConversation] = await db
        .insert(conversations)
        .values({
          propertyId: seed.propertyId,
          channel: 'website',
          externalId: `web_owner_conflict_${Date.now()}`,
          prospectName: 'Jordan Prospect',
          prospectPhone: '555-111-2222',
          status: 'active',
        })
        .returning();

      const second = await bookTourForConversation(
        { propertyId: seed.propertyId, conversationId: secondConversation.id },
        {
          date: '2026-04-27',
          startTime: '09:00',
          now: new Date('2026-04-25T15:00:00.000Z'),
        },
      );

      expect(second).toMatchObject({
        ok: false,
        code: 'owner_unavailable',
      });

      const bookings = await db
        .select()
        .from(tourBookings)
        .where(eq(tourBookings.propertyId, seed.propertyId));
      expect(bookings).toHaveLength(1);
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('reschedules and cancels the same tour booking record', async () => {
    const seed = await seedTourProperty();
    try {
      const booked = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });
      expect(booked.ok).toBe(true);
      if (!booked.ok) throw new Error(booked.message);

      const rescheduled = await rescheduleTourForConversation(seed.ctx, {
        bookingId: booked.booking.id,
        date: '2026-04-27',
        startTime: '09:30',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });
      expect(rescheduled.ok).toBe(true);
      if (!rescheduled.ok) throw new Error(rescheduled.message);
      expect(rescheduled.booking).toMatchObject({
        id: booked.booking.id,
        startTime: '09:30',
        status: 'booked',
      });

      const cancelled = await cancelTourForConversation(seed.ctx, {
        bookingId: booked.booking.id,
        reason: 'Prospect cannot make it',
      });
      expect(cancelled.ok).toBe(true);
      if (!cancelled.ok) throw new Error(cancelled.message);
      expect(cancelled.booking).toMatchObject({
        id: booked.booking.id,
        status: 'cancelled',
      });

      const rows = await db
        .select()
        .from(tourBookings)
        .where(eq(tourBookings.id, booked.booking.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].cancelledAt).toBeTruthy();
      expect(rows[0].rescheduledAt).toBeTruthy();
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('asks for missing prospect contact details before booking', async () => {
    const seed = await seedTourProperty();
    try {
      await db
        .update(conversations)
        .set({ prospectName: null, prospectEmail: null, prospectPhone: null })
        .where(eq(conversations.id, seed.conversationId));

      const result = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });

      expect(result).toMatchObject({
        ok: false,
        code: 'missing_booking_details',
        missingFields: ['prospectName', 'prospectEmailOrPhone'],
      });
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('suppresses prospect outreach during quiet hours', async () => {
    const seed = await seedTourProperty();
    try {
      const booked = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T03:00:00.000Z'),
      });
      expect(booked.ok).toBe(true);
      if (!booked.ok) throw new Error(booked.message);

      const jobs = await db
        .select()
        .from(tourNotificationJobs)
        .where(eq(tourNotificationJobs.tourBookingId, booked.booking.id));
      expect(jobs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          jobType: 'tour_confirmation',
          recipientKind: 'prospect',
          status: 'suppressed',
          lastError: 'Quiet hours are active for the property timezone.',
        }),
        expect.objectContaining({
          jobType: 'tour_confirmation',
          recipientKind: 'leasing_team',
          status: 'sent',
        }),
      ]));
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('enforces prospect send frequency caps for due reminders', async () => {
    const seed = await seedTourProperty();
    try {
      const booked = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });
      expect(booked.ok).toBe(true);
      if (!booked.ok) throw new Error(booked.message);

      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, seed.conversationId));
      if (!conversation.guestCardId) throw new Error('expected guest card');
      const dummyBookings = await db.insert(tourBookings).values([
        {
          propertyId: seed.propertyId,
          guestCardId: conversation.guestCardId,
          conversationId: seed.conversationId,
          tourType: 'in_person',
          status: 'booked',
          startAt: new Date('2026-04-28T15:00:00.000Z'),
          endAt: new Date('2026-04-28T15:30:00.000Z'),
          timezone: 'America/Chicago',
          source: 'operator',
          metadata: { frequencyCapSeed: 1 },
        },
        {
          propertyId: seed.propertyId,
          guestCardId: conversation.guestCardId,
          conversationId: seed.conversationId,
          tourType: 'in_person',
          status: 'booked',
          startAt: new Date('2026-04-29T15:00:00.000Z'),
          endAt: new Date('2026-04-29T15:30:00.000Z'),
          timezone: 'America/Chicago',
          source: 'operator',
          metadata: { frequencyCapSeed: 2 },
        },
      ]).returning();
      await db.insert(tourNotificationJobs).values(dummyBookings.map((booking, index) => ({
        tourBookingId: booking.id,
        propertyId: seed.propertyId,
        guestCardId: conversation.guestCardId!,
        conversationId: seed.conversationId,
        jobType: 'tour_confirmation' as const,
        recipientKind: 'prospect' as const,
        channel: 'email' as const,
        status: 'sent' as const,
        runAt: new Date(`2026-04-27T14:0${index}:00.000Z`),
        nextAttemptAt: new Date(`2026-04-27T14:0${index}:00.000Z`),
        sentAt: new Date(`2026-04-27T14:0${index}:00.000Z`),
        metadata: { frequencyCapSeed: index + 1 },
      })));

      const result = await processDueTourNotificationJobs({
        now: new Date('2026-04-27T15:00:00.000Z'),
        bookingId: booked.booking.id,
      });
      expect(result.suppressed).toBeGreaterThanOrEqual(1);

      const jobs = await db.select().from(tourNotificationJobs).where(eq(tourNotificationJobs.tourBookingId, booked.booking.id));
      expect(jobs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          jobType: 'tour_reminder',
          recipientKind: 'prospect',
          status: 'suppressed',
          lastError: 'Prospect outreach frequency cap reached for the last 24 hours.',
        }),
      ]));
    } finally {
      await cleanup(seed.orgId);
    }
  });

  it('suppresses due automation during human takeover and supports operator cancellation', async () => {
    const seed = await seedTourProperty();
    try {
      const booked = await bookTourForConversation(seed.ctx, {
        date: '2026-04-27',
        startTime: '09:00',
        now: new Date('2026-04-25T15:00:00.000Z'),
      });
      expect(booked.ok).toBe(true);
      if (!booked.ok) throw new Error(booked.message);

      await db
        .update(conversations)
        .set({ automationState: 'human_takeover' })
        .where(eq(conversations.id, seed.conversationId));
      await processDueTourNotificationJobs({
        now: new Date('2026-04-27T15:00:00.000Z'),
        bookingId: booked.booking.id,
      });

      const jobsAfterTakeover = await db
        .select()
        .from(tourNotificationJobs)
        .where(eq(tourNotificationJobs.tourBookingId, booked.booking.id));
      expect(jobsAfterTakeover).toEqual(expect.arrayContaining([
        expect.objectContaining({
          jobType: 'tour_reminder',
          status: 'suppressed',
          lastError: 'Conversation is in human takeover.',
        }),
      ]));

      const postTourJob = jobsAfterTakeover.find((job) => job.jobType === 'post_tour_follow_up');
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, seed.conversationId));
      if (!postTourJob || !conversation.guestCardId) throw new Error('expected pending post-tour job and guest card');
      await cancelScheduledTourNotificationForOrg({
        orgId: seed.orgId,
        guestCardId: conversation.guestCardId,
        jobId: postTourJob.id,
      });

      const [cancelled] = await db
        .select()
        .from(tourNotificationJobs)
        .where(eq(tourNotificationJobs.id, postTourJob.id));
      expect(cancelled).toMatchObject({
        status: 'suppressed',
        lastError: 'Operator cancelled scheduled follow-up.',
      });
    } finally {
      await cleanup(seed.orgId);
    }
  });
});
