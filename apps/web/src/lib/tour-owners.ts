import {
  and,
  asc,
  db,
  eq,
  gt,
  lt,
  sql,
  tourBookings,
  tourOwners,
  type TourBooking,
  type TourOwner,
  type TourType,
} from '@omnilease/db';
import {
  createGoogleCalendarAvailabilityProvider,
  type BusyInterval,
  type CalendarAvailabilityProvider,
} from '@/lib/tour-availability';

export type TourOwnerAssignment = {
  owner: TourOwner | null;
  status: TourBooking['ownerAssignmentStatus'] | 'unavailable_agents';
  reason: string;
  calendarProvider: string | null;
  calendarId: string | null;
  calendarError: string | null;
};

type RouteOwnerInput = {
  propertyId: string;
  tourType: TourType;
  interval: BusyInterval;
  timezone: string;
  excludeBookingId?: string;
  provider?: CalendarAvailabilityProvider | null;
};

export async function listActiveTourOwners(propertyId: string): Promise<TourOwner[]> {
  const rows = await db
    .select()
    .from(tourOwners)
    .where(and(eq(tourOwners.propertyId, propertyId), eq(tourOwners.isActive, 1)))
    .orderBy(asc(tourOwners.assignmentPriority), asc(tourOwners.displayName));

  return rows;
}

export async function routeTourOwnerForInterval(input: RouteOwnerInput): Promise<TourOwnerAssignment> {
  const owners = (await listActiveTourOwners(input.propertyId))
    .filter((owner) => ownerSupportsTourType(owner, input.tourType));

  if (owners.length === 0) {
    return {
      owner: null,
      status: 'manual_required',
      reason: 'No active tour owner is configured for this tour type.',
      calendarProvider: null,
      calendarId: null,
      calendarError: null,
    };
  }

  const provider = input.provider ?? createGoogleCalendarAvailabilityProvider();

  for (const owner of owners) {
    if (await isOwnerAlreadyBooked(owner.id, input.interval, input.excludeBookingId)) continue;

    if (owner.calendarProvider !== 'google_calendar') {
      return assignment(owner, 'assigned', 'Assigned by deterministic owner priority.', null);
    }

    if (!owner.calendarId) {
      return assignment(owner, 'fallback_assigned', 'Owner calendar ID is missing; assigned by fallback priority.', null);
    }

    if (!provider) {
      return assignment(
        owner,
        'fallback_assigned',
        'Google Calendar OAuth is not configured; assigned by fallback priority.',
        'Missing Google Calendar OAuth credentials',
      );
    }

    try {
      const busyIntervals = await provider.getBusyIntervals({
        calendarId: owner.calendarId,
        timeMin: input.interval.start,
        timeMax: input.interval.end,
        timezone: input.timezone,
      });
      if (busyIntervals.some((busy) => intervalsOverlap(input.interval, busy))) continue;

      return assignment(owner, 'assigned', 'Assigned after owner calendar free/busy check.', null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown owner calendar provider error';
      return assignment(owner, 'fallback_assigned', 'Owner calendar lookup failed; assigned by fallback priority.', message);
    }
  }

  return {
    owner: null,
    status: 'unavailable_agents',
    reason: 'All configured tour owners are unavailable for this slot.',
    calendarProvider: null,
    calendarId: null,
    calendarError: null,
  };
}

export async function isOwnerAlreadyBooked(
  ownerId: string,
  interval: BusyInterval,
  excludeBookingId?: string,
): Promise<boolean> {
  const conditions = [
    eq(tourBookings.tourOwnerId, ownerId),
    eq(tourBookings.status, 'booked' as const),
    lt(tourBookings.startAt, interval.end),
    gt(tourBookings.endAt, interval.start),
  ];
  if (excludeBookingId) conditions.push(sql`${tourBookings.id} <> ${excludeBookingId}`);

  const rows = await db
    .select({ id: tourBookings.id })
    .from(tourBookings)
    .where(and(...conditions))
    .limit(2);

  return rows.length > 0;
}

function assignment(
  owner: TourOwner,
  status: Extract<TourBooking['ownerAssignmentStatus'], 'assigned' | 'fallback_assigned'>,
  reason: string,
  calendarError: string | null,
): TourOwnerAssignment {
  return {
    owner,
    status,
    reason,
    calendarProvider: owner.calendarProvider,
    calendarId: owner.calendarId,
    calendarError,
  };
}

function ownerSupportsTourType(owner: TourOwner, tourType: TourType): boolean {
  return owner.tourTypes.length === 0 || owner.tourTypes.includes(tourType);
}

function intervalsOverlap(a: BusyInterval, b: BusyInterval): boolean {
  return a.start < b.end && a.end > b.start;
}
