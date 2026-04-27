import {
  and,
  asc,
  count,
  conversations,
  db,
  eq,
  guestCardActivities,
  guestCards,
  gte,
  inArray,
  lte,
  properties,
  tourBookings,
  tourNotificationJobs,
  type TourBooking,
  type TourNotificationJob,
  type TourNotificationJobType,
  type TourNotificationRecipientKind,
} from '@omnilease/db';
import { sendOperationalEmail } from '@/lib/email/resend';
import { evaluateOutreachSafety } from '@/lib/outreach-safety';

const MAX_ATTEMPTS = 3;

export type ProcessTourNotificationJobsResult = {
  processed: number;
  sent: number;
  suppressed: number;
  failed: number;
};

type ScheduleTourNotificationsInput = {
  booking: TourBooking;
  now: Date;
};

type JobContext = {
  job: TourNotificationJob;
  booking: TourBooking;
  property: {
    name: string;
    timezone: string;
    escalationEmail: string | null;
  };
  guestCard: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    emailConsentStatus: string | null;
    smsConsentStatus: string | null;
    marketingConsentStatus: string | null;
  } | null;
  conversation: {
    prospectName: string | null;
    prospectEmail: string | null;
    prospectPhone: string | null;
    status: string | null;
    automationState: string | null;
  } | null;
};

export async function scheduleTourNotificationJobs(
  tx: Pick<typeof db, 'insert'>,
  input: ScheduleTourNotificationsInput,
) {
  const rows = buildTourNotificationJobs(input);
  if (rows.length === 0) return;

  await tx
    .insert(tourNotificationJobs)
    .values(rows)
    .onConflictDoNothing({
      target: [
        tourNotificationJobs.tourBookingId,
        tourNotificationJobs.jobType,
        tourNotificationJobs.recipientKind,
      ],
    });
}

export async function processDueTourNotificationJobs(
  options: { now?: Date; limit?: number; bookingId?: string } = {},
): Promise<ProcessTourNotificationJobsResult> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const dueRows = await loadDueJobs(now, limit, options.bookingId);
  const result: ProcessTourNotificationJobsResult = {
    processed: 0,
    sent: 0,
    suppressed: 0,
    failed: 0,
  };

  for (const row of dueRows) {
    result.processed += 1;
    const outcome = await processJob(row, now);
    result[outcome] += 1;
  }

  return result;
}

export async function cancelScheduledTourNotificationForOrg(input: {
  orgId: string;
  guestCardId: string;
  jobId: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const [row] = await db
    .select({
      job: tourNotificationJobs,
      booking: tourBookings,
      property: {
        name: properties.name,
        timezone: properties.timezone,
        escalationEmail: properties.escalationEmail,
      },
      guestCard: {
        fullName: guestCards.fullName,
        email: guestCards.email,
        phone: guestCards.phone,
        emailConsentStatus: guestCards.emailConsentStatus,
        smsConsentStatus: guestCards.smsConsentStatus,
        marketingConsentStatus: guestCards.marketingConsentStatus,
      },
      conversation: {
        prospectName: conversations.prospectName,
        prospectEmail: conversations.prospectEmail,
        prospectPhone: conversations.prospectPhone,
        status: conversations.status,
        automationState: conversations.automationState,
      },
    })
    .from(tourNotificationJobs)
    .innerJoin(tourBookings, eq(tourNotificationJobs.tourBookingId, tourBookings.id))
    .innerJoin(properties, eq(tourNotificationJobs.propertyId, properties.id))
    .leftJoin(guestCards, eq(tourNotificationJobs.guestCardId, guestCards.id))
    .leftJoin(conversations, eq(tourNotificationJobs.conversationId, conversations.id))
    .where(and(
      eq(tourNotificationJobs.id, input.jobId),
      eq(tourNotificationJobs.guestCardId, input.guestCardId),
      eq(properties.orgId, input.orgId),
      inArray(tourNotificationJobs.status, ['pending', 'failed']),
    ))
    .limit(1);

  if (!row) {
    throw new Error('Scheduled follow-up was not found or is no longer cancellable.');
  }

  await markSuppressed(row as JobContext, now, 'Operator cancelled scheduled follow-up.');
}

function buildTourNotificationJobs(input: ScheduleTourNotificationsInput) {
  const { booking, now } = input;
  const reminderAt = reminderRunAt(booking, now);
  const postTourAt = addMinutes(booking.endAt, 120);
  const base = {
    tourBookingId: booking.id,
    propertyId: booking.propertyId,
    guestCardId: booking.guestCardId,
    conversationId: booking.conversationId,
    status: 'pending' as const,
    attempts: 0,
    lastError: null,
    metadata: {},
    updatedAt: now,
  };

  return [
    {
      ...base,
      jobType: 'tour_confirmation' as const,
      recipientKind: 'prospect' as const,
      channel: 'email' as const,
      runAt: now,
      nextAttemptAt: now,
    },
    {
      ...base,
      jobType: 'tour_confirmation' as const,
      recipientKind: 'leasing_team' as const,
      channel: 'email' as const,
      runAt: now,
      nextAttemptAt: now,
    },
    {
      ...base,
      jobType: 'tour_reminder' as const,
      recipientKind: 'prospect' as const,
      channel: 'email' as const,
      runAt: reminderAt,
      nextAttemptAt: reminderAt,
    },
    {
      ...base,
      jobType: 'post_tour_follow_up' as const,
      recipientKind: 'dashboard_task' as const,
      channel: 'dashboard_task' as const,
      runAt: postTourAt,
      nextAttemptAt: postTourAt,
    },
  ];
}

async function loadDueJobs(now: Date, limit: number, bookingId?: string): Promise<JobContext[]> {
  const conditions = [
    inArray(tourNotificationJobs.status, ['pending', 'failed']),
    lte(tourNotificationJobs.nextAttemptAt, now),
  ];
  if (bookingId) conditions.push(eq(tourNotificationJobs.tourBookingId, bookingId));

  const rows = await db
    .select({
      job: tourNotificationJobs,
      booking: tourBookings,
      property: {
        name: properties.name,
        timezone: properties.timezone,
        escalationEmail: properties.escalationEmail,
      },
      guestCard: {
        fullName: guestCards.fullName,
        email: guestCards.email,
        phone: guestCards.phone,
        emailConsentStatus: guestCards.emailConsentStatus,
        smsConsentStatus: guestCards.smsConsentStatus,
        marketingConsentStatus: guestCards.marketingConsentStatus,
      },
      conversation: {
        prospectName: conversations.prospectName,
        prospectEmail: conversations.prospectEmail,
        prospectPhone: conversations.prospectPhone,
        status: conversations.status,
        automationState: conversations.automationState,
      },
    })
    .from(tourNotificationJobs)
    .innerJoin(tourBookings, eq(tourNotificationJobs.tourBookingId, tourBookings.id))
    .innerJoin(properties, eq(tourNotificationJobs.propertyId, properties.id))
    .leftJoin(guestCards, eq(tourNotificationJobs.guestCardId, guestCards.id))
    .leftJoin(conversations, eq(tourNotificationJobs.conversationId, conversations.id))
    .where(and(...conditions))
    .orderBy(asc(tourNotificationJobs.nextAttemptAt))
    .limit(limit);

  return rows as JobContext[];
}

async function processJob(
  context: JobContext,
  now: Date,
): Promise<'sent' | 'suppressed' | 'failed'> {
  if (context.booking.status !== 'booked') {
    await markSuppressed(context, now, 'Tour is no longer booked.');
    return 'suppressed';
  }

  try {
    const recentProspectSendCount = context.job.recipientKind === 'prospect'
      ? await countRecentProspectSends(context, now)
      : 0;
    const safety = evaluateOutreachSafety({
      recipientKind: context.job.recipientKind,
      channel: context.job.channel,
      now,
      propertyTimezone: context.property.timezone,
      guestCard: context.guestCard,
      conversation: context.conversation,
      recentProspectSendCount,
    });
    if (!safety.ok) {
      await markSuppressed(context, now, safety.reason);
      return 'suppressed';
    }

    if (context.job.channel === 'dashboard_task') {
      await createPostTourTask(context, now);
      await markSent(context.job.id, now, context.job.attempts + 1);
      return 'sent';
    }

    const email = buildEmail(context);
    if (!email.ok) {
      await markSuppressed(context, now, email.reason);
      return 'suppressed';
    }

    await sendOperationalEmail(email.message);
    await createActivity(context, {
      now,
      eventType: 'tour',
      title: sentActivityTitle(context.job.jobType, context.job.recipientKind),
      description: `Delivered to ${email.message.to}.`,
      metadata: { tourNotificationJobId: context.job.id, status: 'sent' },
    });
    await markSent(context.job.id, now, context.job.attempts + 1);
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown delivery error';
    await markFailed(context, now, message);
    return 'failed';
  }
}

function buildEmail(context: JobContext):
  | { ok: true; message: { to: string; subject: string; text: string } }
  | { ok: false; reason: string } {
  if (context.job.recipientKind === 'leasing_team') {
    if (!context.property.escalationEmail) {
      return { ok: false, reason: 'Property escalation email is not configured.' };
    }

    return {
      ok: true,
      message: {
        to: context.property.escalationEmail,
        subject: `[${context.property.name}] Tour booked for ${prospectLabel(context)}`,
        text: [
          `A ${tourTypeLabel(context.booking.tourType)} tour was booked at ${context.property.name}.`,
          '',
          `Prospect: ${prospectLabel(context)}`,
          `Tour: ${formatTourTime(context.booking)}`,
          context.booking.conversationId ? `Conversation ID: ${context.booking.conversationId}` : null,
          '',
          'Review the guest card for follow-up details.',
          '',
          '- Omnilease',
        ].filter(Boolean).join('\n'),
      },
    };
  }

  const to = context.guestCard?.email ?? context.conversation?.prospectEmail;
  if (!to) return { ok: false, reason: 'Prospect email is not available.' };

  const reminder = context.job.jobType === 'tour_reminder';
  return {
    ok: true,
    message: {
      to,
      subject: reminder
        ? `Reminder: your ${context.property.name} tour`
        : `Your ${context.property.name} tour is confirmed`,
      text: [
        `Hi ${firstName(context) ?? 'there'},`,
        '',
        reminder
          ? `This is a reminder for your ${tourTypeLabel(context.booking.tourType)} tour at ${context.property.name}.`
          : `Your ${tourTypeLabel(context.booking.tourType)} tour at ${context.property.name} is confirmed.`,
        '',
        `Tour: ${formatTourTime(context.booking)}`,
        '',
        'Reply to the conversation if you need to reschedule or cancel.',
        '',
        '- Omnilease',
      ].join('\n'),
    },
  };
}

async function countRecentProspectSends(context: JobContext, now: Date): Promise<number> {
  if (!context.job.guestCardId) return 0;
  const since = addMinutes(now, -24 * 60);
  const [row] = await db
    .select({ value: count() })
    .from(tourNotificationJobs)
    .where(and(
      eq(tourNotificationJobs.guestCardId, context.job.guestCardId),
      eq(tourNotificationJobs.recipientKind, 'prospect'),
      eq(tourNotificationJobs.status, 'sent'),
      gte(tourNotificationJobs.sentAt, since),
    ));
  return Number(row?.value ?? 0);
}

async function createPostTourTask(context: JobContext, now: Date) {
  await createActivity(context, {
    now,
    eventType: 'task',
    title: 'Post-tour follow-up due',
    description: `Follow up with ${prospectLabel(context)} after their ${formatTourTime(context.booking)} tour.`,
    metadata: {
      tourNotificationJobId: context.job.id,
      tourBookingId: context.booking.id,
      status: 'ready',
    },
  });
}

async function markSent(jobId: string, now: Date, attempts: number) {
  await db
    .update(tourNotificationJobs)
    .set({
      status: 'sent',
      attempts,
      sentAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(tourNotificationJobs.id, jobId));
}

async function markSuppressed(context: JobContext, now: Date, reason: string) {
  await createActivity(context, {
    now,
    eventType: 'tour',
    title: suppressedActivityTitle(context.job.jobType, context.job.recipientKind),
    description: reason,
    metadata: { tourNotificationJobId: context.job.id, status: 'suppressed' },
  });
  await db
    .update(tourNotificationJobs)
    .set({
      status: 'suppressed',
      attempts: context.job.attempts,
      sentAt: null,
      lastError: reason,
      updatedAt: now,
    })
    .where(eq(tourNotificationJobs.id, context.job.id));
}

async function markFailed(context: JobContext, now: Date, error: string) {
  const attempts = context.job.attempts + 1;
  await createActivity(context, {
    now,
    eventType: 'task',
    title: 'Tour notification delivery failed',
    description: error,
    metadata: {
      tourNotificationJobId: context.job.id,
      status: 'failed',
      attempts,
      retryable: attempts < MAX_ATTEMPTS,
    },
  });
  await db
    .update(tourNotificationJobs)
    .set({
      status: 'failed',
      attempts,
      nextAttemptAt: attempts < MAX_ATTEMPTS ? addMinutes(now, retryDelayMinutes(attempts)) : now,
      lastError: error,
      updatedAt: now,
    })
    .where(eq(tourNotificationJobs.id, context.job.id));
}

async function createActivity(
  context: JobContext,
  input: {
    now: Date;
    eventType: 'tour' | 'task';
    title: string;
    description: string;
    metadata: Record<string, unknown>;
  },
) {
  if (!context.booking.guestCardId) return;
  await db.insert(guestCardActivities).values({
    guestCardId: context.booking.guestCardId,
    propertyId: context.booking.propertyId,
    conversationId: context.booking.conversationId,
    eventType: input.eventType,
    title: input.title,
    description: input.description,
    metadata: {
      ...input.metadata,
      tourBookingId: context.booking.id,
      jobType: context.job.jobType,
      recipientKind: context.job.recipientKind,
    },
    occurredAt: input.now,
  });
}

function reminderRunAt(booking: TourBooking, now: Date) {
  const oneDayBefore = addMinutes(booking.startAt, -24 * 60);
  if (oneDayBefore > now) return oneDayBefore;

  const twoHoursBefore = addMinutes(booking.startAt, -120);
  if (twoHoursBefore > now) return twoHoursBefore;

  return now;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

function retryDelayMinutes(attempts: number) {
  return Math.min(60, 5 * (2 ** Math.max(attempts - 1, 0)));
}

function formatTourTime(booking: TourBooking) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: booking.timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return formatter.format(booking.startAt);
}

function prospectLabel(context: JobContext) {
  return (
    context.guestCard?.fullName ??
    context.conversation?.prospectName ??
    context.guestCard?.email ??
    context.conversation?.prospectEmail ??
    context.guestCard?.phone ??
    context.conversation?.prospectPhone ??
    'prospect'
  );
}

function firstName(context: JobContext) {
  const name = context.guestCard?.fullName ?? context.conversation?.prospectName;
  return name?.trim().split(/\s+/)[0] ?? null;
}

function tourTypeLabel(tourType: TourBooking['tourType']) {
  return tourType.replace('_', '-');
}

function sentActivityTitle(
  jobType: TourNotificationJobType,
  recipientKind: TourNotificationRecipientKind,
) {
  if (recipientKind === 'leasing_team') return 'Tour confirmation sent to leasing team';
  if (jobType === 'tour_reminder') return 'Tour reminder sent to prospect';
  return 'Tour confirmation sent to prospect';
}


function suppressedActivityTitle(
  jobType: TourNotificationJobType,
  recipientKind: TourNotificationRecipientKind,
) {
  if (recipientKind === 'leasing_team') return 'Tour team notification skipped';
  if (jobType === 'tour_reminder') return 'Tour reminder suppressed';
  return 'Tour confirmation suppressed';
}
