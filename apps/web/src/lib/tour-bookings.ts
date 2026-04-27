import {
  and,
  count,
  db,
  eq,
  gt,
  guestCardActivities,
  guestCards,
  conversations,
  lt,
  properties,
  sql,
  tourBookings,
  type TourBooking,
  type TourType,
} from '@omnilease/db';
import { getTourSettingsForProperty } from '@/lib/tour-settings-store';
import type { TourSlot } from '@/lib/tour-settings';
import { getTourAvailability, tourSlotToInterval } from '@/lib/tour-availability';
import { syncGuestCardForConversation } from '@/lib/guest-cards/service';
import {
  processDueTourNotificationJobs,
  scheduleTourNotificationJobs,
} from '@/lib/tour-notifications';
import {
  routeTourOwnerForInterval,
  type TourOwnerAssignment,
} from '@/lib/tour-owners';

export type TourToolContext = {
  conversationId: string;
  propertyId: string;
};

export type TourBookingToolResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | ({ ok: true } & T)
  | {
      ok: false;
      code:
        | 'conversation_not_found'
        | 'property_not_found'
        | 'booking_not_found'
        | 'missing_booking_details'
        | 'slot_unavailable'
        | 'owner_unavailable'
        | 'already_cancelled';
      message: string;
      missingFields?: string[];
      availableSlots?: Array<ReturnType<typeof serializeSlot>>;
    };

type ListSlotsInput = {
  startDate?: string;
  endDate?: string;
  tourType?: TourType;
  limit?: number;
  now?: Date;
};

type BookTourInput = {
  date: string;
  startTime: string;
  tourType?: TourType;
  prospectName?: string;
  prospectEmail?: string;
  prospectPhone?: string;
  now?: Date;
};

type RescheduleTourInput = {
  bookingId: string;
  date: string;
  startTime: string;
  tourType?: TourType;
  now?: Date;
};

type CancelTourInput = {
  bookingId: string;
  reason?: string;
};

type BookingSummary = {
  id: string;
  status: TourBooking['status'];
  date: string;
  startTime: string;
  endTime: string;
  tourType: TourType;
  timezone: string;
  owner: {
    id: string;
    name: string;
    email: string | null;
  } | null;
  ownerAssignmentStatus: TourBooking['ownerAssignmentStatus'];
  ownerAssignmentReason: string | null;
};

export async function listTourSlotsForConversation(
  ctx: TourToolContext,
  input: ListSlotsInput = {},
): Promise<TourBookingToolResult<{
  slots: Array<ReturnType<typeof serializeSlot>>;
  availabilityStatus: string;
  availabilitySource: string;
}>> {
  const property = await loadProperty(ctx.propertyId);
  if (!property) {
    return { ok: false, code: 'property_not_found', message: 'Property was not found.' };
  }

  const settings = await getTourSettingsForProperty(ctx.propertyId);
  const availability = await getTourAvailability(settings, {
    timezone: property.timezone,
    startDate: input.startDate,
    endDate: input.endDate,
    now: input.now,
  });
  const tourType = input.tourType ?? settings.enabledTourTypes[0] ?? 'in_person';
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
  const routedSlots = await routeSlotsForOwners({
    propertyId: ctx.propertyId,
    tourType,
    timezone: property.timezone,
    slots: availability.slots,
  });

  return {
    ok: true,
    slots: routedSlots.slice(0, limit),
    availabilityStatus: availability.status.status,
    availabilitySource: availability.status.source,
  };
}

export async function bookTourForConversation(
  ctx: TourToolContext,
  input: BookTourInput,
): Promise<TourBookingToolResult<{ booking: BookingSummary }>> {
  const conversation = await loadConversation(ctx.conversationId, ctx.propertyId);
  if (!conversation) {
    return { ok: false, code: 'conversation_not_found', message: 'Conversation was not found.' };
  }

  const details = mergeProspectDetails(conversation, input);
  const missingFields = missingBookingDetails(details);
  if (missingFields.length) {
    return {
      ok: false,
      code: 'missing_booking_details',
      message: 'Ask for the missing booking details before booking the tour.',
      missingFields,
    };
  }

  const slot = await findAvailableSlot(ctx.propertyId, {
    date: input.date,
    startTime: input.startTime,
    tourType: input.tourType,
    now: input.now,
  });
  if (!slot.ok) return slot;

  const guestCardId = await ensureGuestCard(ctx, {
    name: details.name,
    email: details.email,
    phone: details.phone,
  });

  const lockKey = bookingLockKey(ctx.propertyId, slot.interval.start, slot.interval.end);
  const now = input.now ?? new Date();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    if (slot.ownerAssignment.owner) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerLockKey(slot.ownerAssignment.owner.id)}))`);
      const ownerBooked = await countOwnerBookedTours(
        tx,
        slot.ownerAssignment.owner.id,
        slot.interval.start,
        slot.interval.end,
      );
      if (ownerBooked > 0) return null;
    }
    const bookedCount = await countBookedTours(tx, ctx.propertyId, slot.interval.start, slot.interval.end);
    if (bookedCount >= slot.settings.capacityPerSlot) return null;

    const [booking] = await tx
      .insert(tourBookings)
      .values({
        propertyId: ctx.propertyId,
        guestCardId,
        conversationId: ctx.conversationId,
        tourType: slot.tourType,
        status: 'booked',
        startAt: slot.interval.start,
        endAt: slot.interval.end,
        timezone: slot.property.timezone,
        source: 'ai_tool',
        tourOwnerId: slot.ownerAssignment.owner?.id ?? null,
        ownerAssignmentStatus: coerceBookingAssignmentStatus(slot.ownerAssignment.status),
        ownerAssignmentReason: slot.ownerAssignment.reason,
        calendarProvider: slot.ownerAssignment.calendarProvider,
        calendarId: slot.ownerAssignment.calendarId,
        metadata: {
          bookedVia: 'conversation_tool',
          tourOwnerName: slot.ownerAssignment.owner?.displayName ?? null,
          ownerCalendarError: slot.ownerAssignment.calendarError,
        },
        updatedAt: now,
      })
      .returning();

    await markTourScheduled(tx, {
      booking,
      guestCardId,
      conversationId: ctx.conversationId,
      propertyId: ctx.propertyId,
      title: 'Tour booked by AI assistant',
    });
    await scheduleTourNotificationJobs(tx, { booking, now });

    return booking;
  });

  if (!result) {
    return slotUnavailable(slot.availableSlots, 'That tour slot was just taken. Offer another available slot.');
  }

  await processDueTourNotificationJobs({ now, bookingId: result.id });

  return { ok: true, booking: summarizeBooking(result) };
}

export async function rescheduleTourForConversation(
  ctx: TourToolContext,
  input: RescheduleTourInput,
): Promise<TourBookingToolResult<{ booking: BookingSummary }>> {
  const [existing] = await db
    .select()
    .from(tourBookings)
    .where(and(
      eq(tourBookings.id, input.bookingId),
      eq(tourBookings.propertyId, ctx.propertyId),
      eq(tourBookings.conversationId, ctx.conversationId),
    ))
    .limit(1);
  if (!existing) {
    return { ok: false, code: 'booking_not_found', message: 'Tour booking was not found for this conversation.' };
  }
  if (existing.status === 'cancelled') {
    return { ok: false, code: 'already_cancelled', message: 'Cancelled tours cannot be rescheduled.' };
  }

  const slot = await findAvailableSlot(ctx.propertyId, {
    date: input.date,
    startTime: input.startTime,
    tourType: input.tourType ?? existing.tourType,
    now: input.now,
  });
  if (!slot.ok) return slot;

  const lockKey = bookingLockKey(ctx.propertyId, slot.interval.start, slot.interval.end);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    if (slot.ownerAssignment.owner) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerLockKey(slot.ownerAssignment.owner.id)}))`);
      const ownerBooked = await countOwnerBookedTours(
        tx,
        slot.ownerAssignment.owner.id,
        slot.interval.start,
        slot.interval.end,
        existing.id,
      );
      if (ownerBooked > 0) return null;
    }
    const bookedCount = await countBookedTours(
      tx,
      ctx.propertyId,
      slot.interval.start,
      slot.interval.end,
      existing.id,
    );
    if (bookedCount >= slot.settings.capacityPerSlot) return null;

    const now = new Date();
    const [booking] = await tx
      .update(tourBookings)
      .set({
        tourType: slot.tourType,
        status: 'booked',
        startAt: slot.interval.start,
        endAt: slot.interval.end,
        timezone: slot.property.timezone,
        tourOwnerId: slot.ownerAssignment.owner?.id ?? null,
        ownerAssignmentStatus: coerceBookingAssignmentStatus(slot.ownerAssignment.status),
        ownerAssignmentReason: slot.ownerAssignment.reason,
        calendarProvider: slot.ownerAssignment.calendarProvider,
        calendarId: slot.ownerAssignment.calendarId,
        rescheduledAt: now,
        metadata: {
          ...(existing.metadata ?? {}),
          tourOwnerName: slot.ownerAssignment.owner?.displayName ?? null,
          ownerCalendarError: slot.ownerAssignment.calendarError,
          lastReschedule: {
            fromStartAt: existing.startAt.toISOString(),
            fromEndAt: existing.endAt.toISOString(),
            toStartAt: slot.interval.start.toISOString(),
            toEndAt: slot.interval.end.toISOString(),
          },
        },
        updatedAt: now,
      })
      .where(eq(tourBookings.id, existing.id))
      .returning();

    if (booking.guestCardId) {
      await tx.insert(guestCardActivities).values({
        guestCardId: booking.guestCardId,
        propertyId: booking.propertyId,
        conversationId: booking.conversationId,
        eventType: 'tour',
        title: 'Tour rescheduled by AI assistant',
        metadata: { tourBookingId: booking.id, startAt: booking.startAt.toISOString() },
      });
    }

    return booking;
  });

  if (!result) {
    return slotUnavailable(slot.availableSlots, 'That tour slot was just taken. Offer another available slot.');
  }

  return { ok: true, booking: summarizeBooking(result) };
}

export async function cancelTourForConversation(
  ctx: TourToolContext,
  input: CancelTourInput,
): Promise<TourBookingToolResult<{ booking: BookingSummary }>> {
  const [existing] = await db
    .select()
    .from(tourBookings)
    .where(and(
      eq(tourBookings.id, input.bookingId),
      eq(tourBookings.propertyId, ctx.propertyId),
      eq(tourBookings.conversationId, ctx.conversationId),
    ))
    .limit(1);
  if (!existing) {
    return { ok: false, code: 'booking_not_found', message: 'Tour booking was not found for this conversation.' };
  }
  if (existing.status === 'cancelled') {
    return { ok: false, code: 'already_cancelled', message: 'This tour is already cancelled.' };
  }

  const now = new Date();
  const [booking] = await db
    .update(tourBookings)
    .set({
      status: 'cancelled',
      cancelledAt: now,
      cancellationReason: input.reason ?? null,
      updatedAt: now,
    })
    .where(eq(tourBookings.id, existing.id))
    .returning();

  if (booking.guestCardId) {
    await db.insert(guestCardActivities).values({
      guestCardId: booking.guestCardId,
      propertyId: booking.propertyId,
      conversationId: booking.conversationId,
      eventType: 'tour',
      title: 'Tour cancelled by AI assistant',
      metadata: { tourBookingId: booking.id, reason: input.reason ?? null },
    });
  }

  return { ok: true, booking: summarizeBooking(booking) };
}

async function findAvailableSlot(
  propertyId: string,
  input: { date: string; startTime: string; tourType?: TourType; now?: Date },
): Promise<
  | {
      ok: true;
      interval: ReturnType<typeof tourSlotToInterval>;
      settings: Awaited<ReturnType<typeof getTourSettingsForProperty>>;
      property: NonNullable<Awaited<ReturnType<typeof loadProperty>>>;
      tourType: TourType;
      availableSlots: Array<ReturnType<typeof serializeSlot>>;
      ownerAssignment: TourOwnerAssignment;
    }
  | Extract<TourBookingToolResult, { ok: false }>
> {
  const property = await loadProperty(propertyId);
  if (!property) {
    return { ok: false, code: 'property_not_found', message: 'Property was not found.' };
  }

  const settings = await getTourSettingsForProperty(propertyId);
  const tourType = input.tourType ?? settings.enabledTourTypes[0] ?? 'in_person';
  const availability = await getTourAvailability(settings, {
    timezone: property.timezone,
    startDate: input.date,
    endDate: input.date,
    now: input.now,
  });
  const availableSlots = availability.slots.map((slot) => serializeSlot(slot, tourType));
  const selected = availability.slots.find((slot) => slot.date === input.date && slot.startTime === input.startTime);
  if (!selected) {
    return slotUnavailable(availableSlots, 'That tour slot is no longer available. Offer another available slot.');
  }
  const interval = tourSlotToInterval(selected, property.timezone);
  const ownerAssignment = await routeTourOwnerForInterval({
    propertyId,
    tourType,
    interval,
    timezone: property.timezone,
  });
  if (ownerAssignment.status === 'unavailable_agents') {
    const routedSlots = await routeSlotsForOwners({
      propertyId,
      tourType,
      timezone: property.timezone,
      slots: availability.slots,
    });
    return {
      ok: false,
      code: 'owner_unavailable',
      message: 'All configured tour owners are unavailable for that slot. Offer another available slot or escalate for manual scheduling.',
      availableSlots: routedSlots.slice(0, 8),
    };
  }

  return {
    ok: true,
    interval,
    settings,
    property,
    tourType,
    availableSlots,
    ownerAssignment,
  };
}

async function loadProperty(propertyId: string) {
  const [property] = await db
    .select({ id: properties.id, timezone: properties.timezone })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  return property ?? null;
}

async function loadConversation(conversationId: string, propertyId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.propertyId, propertyId)))
    .limit(1);
  return conversation ?? null;
}

function mergeProspectDetails(
  conversation: NonNullable<Awaited<ReturnType<typeof loadConversation>>>,
  input: BookTourInput,
) {
  return {
    name: input.prospectName ?? conversation.prospectName,
    email: input.prospectEmail ?? conversation.prospectEmail,
    phone: input.prospectPhone ?? conversation.prospectPhone,
  };
}

function missingBookingDetails(details: { name: string | null; email: string | null; phone: string | null }) {
  const missing: string[] = [];
  if (!details.name) missing.push('prospectName');
  if (!details.email && !details.phone) missing.push('prospectEmailOrPhone');
  return missing;
}

async function ensureGuestCard(
  ctx: TourToolContext,
  details: { name: string | null; email: string | null; phone: string | null },
) {
  const now = new Date();
  await db
    .update(conversations)
    .set({
      prospectName: details.name,
      prospectEmail: details.email,
      prospectPhone: details.phone,
      updatedAt: now,
    })
    .where(eq(conversations.id, ctx.conversationId));

  const [conversation] = await db
    .select({
      channel: conversations.channel,
      externalId: conversations.externalId,
    })
    .from(conversations)
    .where(eq(conversations.id, ctx.conversationId))
    .limit(1);

  const result = await syncGuestCardForConversation({
    conversationId: ctx.conversationId,
    propertyId: ctx.propertyId,
    channel: conversation.channel,
    externalId: conversation.externalId,
    source: 'tour_booking',
    name: details.name,
    email: details.email,
    phone: details.phone,
    metadata: { tourBookingIntent: true },
  });
  await preserveOrActivateTourConsent(result.guestCardId, details);
  return result.guestCardId;
}

async function preserveOrActivateTourConsent(
  guestCardId: string,
  details: { email: string | null; phone: string | null },
) {
  const [guestCard] = await db
    .select({
      emailConsentStatus: guestCards.emailConsentStatus,
      smsConsentStatus: guestCards.smsConsentStatus,
    })
    .from(guestCards)
    .where(eq(guestCards.id, guestCardId))
    .limit(1);

  if (!guestCard) return;
  await db
    .update(guestCards)
    .set({
      emailConsentStatus: details.email && !guestCard.emailConsentStatus
        ? 'subscribed'
        : guestCard.emailConsentStatus,
      smsConsentStatus: details.phone && !guestCard.smsConsentStatus
        ? 'subscribed'
        : guestCard.smsConsentStatus,
      updatedAt: new Date(),
    })
    .where(eq(guestCards.id, guestCardId));
}

async function countBookedTours(
  tx: Pick<typeof db, 'select'>,
  propertyId: string,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
) {
  const conditions = [
    eq(tourBookings.propertyId, propertyId),
    eq(tourBookings.status, 'booked' as const),
    eq(tourBookings.startAt, startAt),
    eq(tourBookings.endAt, endAt),
  ];
  if (excludeBookingId) conditions.push(sql`${tourBookings.id} <> ${excludeBookingId}`);
  const [row] = await tx
    .select({ value: count() })
    .from(tourBookings)
    .where(and(...conditions));
  return row?.value ?? 0;
}

async function markTourScheduled(
  tx: Pick<typeof db, 'insert' | 'update'>,
  input: {
    booking: TourBooking;
    guestCardId: string;
    conversationId: string;
    propertyId: string;
    title: string;
  },
) {
  const now = new Date();
  await tx
    .update(guestCards)
    .set({ stage: 'tour_scheduled', updatedAt: now, lastSeenAt: now })
    .where(eq(guestCards.id, input.guestCardId));
  await tx
    .update(conversations)
    .set({ guestCardId: input.guestCardId, status: 'converted', updatedAt: now })
    .where(eq(conversations.id, input.conversationId));
  await tx.insert(guestCardActivities).values({
    guestCardId: input.guestCardId,
    propertyId: input.propertyId,
    conversationId: input.conversationId,
    eventType: 'tour',
    title: input.title,
    metadata: {
      tourBookingId: input.booking.id,
      startAt: input.booking.startAt.toISOString(),
      endAt: input.booking.endAt.toISOString(),
      tourType: input.booking.tourType,
      tourOwnerId: input.booking.tourOwnerId,
      ownerAssignmentStatus: input.booking.ownerAssignmentStatus,
      ownerAssignmentReason: input.booking.ownerAssignmentReason,
    },
  });
}

function serializeSlot(
  slot: { date: string; startTime: string; endTime: string },
  tourType: TourType,
  ownerAssignment?: TourOwnerAssignment,
) {
  return {
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    tourType,
    owner: ownerAssignment?.owner
      ? {
          id: ownerAssignment.owner.id,
          name: ownerAssignment.owner.displayName,
          email: ownerAssignment.owner.email,
        }
      : null,
    ownerAssignmentStatus: ownerAssignment
      ? coerceBookingAssignmentStatus(ownerAssignment.status)
      : 'unassigned',
    ownerAssignmentReason: ownerAssignment?.reason ?? null,
  };
}

function summarizeBooking(booking: TourBooking): BookingSummary {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: booking.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(booking.startAt);
  const timeFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: booking.timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    id: booking.id,
    status: booking.status,
    date: dateParts,
    startTime: timeFormat.format(booking.startAt),
    endTime: timeFormat.format(booking.endAt),
    tourType: booking.tourType,
    timezone: booking.timezone,
    owner: booking.tourOwnerId
      ? {
          id: booking.tourOwnerId,
          name: typeof booking.metadata?.tourOwnerName === 'string'
            ? booking.metadata.tourOwnerName
            : 'Assigned tour owner',
          email: null,
        }
      : null,
    ownerAssignmentStatus: booking.ownerAssignmentStatus,
    ownerAssignmentReason: booking.ownerAssignmentReason,
  };
}

function slotUnavailable(
  availableSlots: Array<ReturnType<typeof serializeSlot>>,
  message: string,
): Extract<TourBookingToolResult, { ok: false }> {
  return {
    ok: false,
    code: 'slot_unavailable',
    message,
    availableSlots: availableSlots.slice(0, 8),
  };
}

function bookingLockKey(propertyId: string, startAt: Date, endAt: Date) {
  return `${propertyId}:${startAt.toISOString()}:${endAt.toISOString()}`;
}

function ownerLockKey(ownerId: string) {
  return `tour-owner:${ownerId}`;
}

async function countOwnerBookedTours(
  tx: Pick<typeof db, 'select'>,
  ownerId: string,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
) {
  const conditions = [
    eq(tourBookings.tourOwnerId, ownerId),
    eq(tourBookings.status, 'booked' as const),
    lt(tourBookings.startAt, endAt),
    gt(tourBookings.endAt, startAt),
  ];
  if (excludeBookingId) conditions.push(sql`${tourBookings.id} <> ${excludeBookingId}`);
  const [row] = await tx
    .select({ value: count() })
    .from(tourBookings)
    .where(and(...conditions));
  return row?.value ?? 0;
}

async function routeSlotsForOwners({
  propertyId,
  tourType,
  timezone,
  slots,
}: {
  propertyId: string;
  tourType: TourType;
  timezone: string;
  slots: TourSlot[];
}) {
  const routed: Array<ReturnType<typeof serializeSlot>> = [];
  for (const slot of slots) {
    const interval = tourSlotToInterval(slot, timezone);
    const assignment = await routeTourOwnerForInterval({ propertyId, tourType, interval, timezone });
    if (assignment.status === 'unavailable_agents') continue;
    routed.push(serializeSlot(slot, tourType, assignment));
  }
  return routed;
}

function coerceBookingAssignmentStatus(
  status: TourOwnerAssignment['status'],
): TourBooking['ownerAssignmentStatus'] {
  return status === 'unavailable_agents' ? 'unassigned' : status;
}
