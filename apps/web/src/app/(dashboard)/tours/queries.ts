import {
  and,
  count,
  db,
  desc,
  eq,
  conversations,
  guestCards,
  properties,
  tourBookings,
  tourOwners,
} from '@omnilease/db';
import { computeTourMetrics } from '@/lib/tour-reporting';

export type TourDashboardRow = {
  id: string;
  status: typeof tourBookings.$inferSelect.status;
  tourType: typeof tourBookings.$inferSelect.tourType;
  startAt: Date;
  endAt: Date;
  timezone: string;
  source: typeof tourBookings.$inferSelect.source;
  ownerAssignmentStatus: typeof tourBookings.$inferSelect.ownerAssignmentStatus;
  ownerAssignmentReason: string | null;
  propertyId: string;
  propertyName: string;
  guestCardId: string | null;
  guestCardName: string | null;
  guestCardEmail: string | null;
  guestCardPhone: string | null;
  conversationId: string | null;
  conversationProspectName: string | null;
  conversationProspectEmail: string | null;
  conversationProspectPhone: string | null;
  ownerName: string | null;
};

export async function getTourDashboardForOrg(orgId: string) {
  const [tourRows, [{ value: conversationCount }]] = await Promise.all([
    db
      .select({
        id: tourBookings.id,
        status: tourBookings.status,
        tourType: tourBookings.tourType,
        startAt: tourBookings.startAt,
        endAt: tourBookings.endAt,
        timezone: tourBookings.timezone,
        source: tourBookings.source,
        ownerAssignmentStatus: tourBookings.ownerAssignmentStatus,
        ownerAssignmentReason: tourBookings.ownerAssignmentReason,
        propertyId: properties.id,
        propertyName: properties.name,
        guestCardId: guestCards.id,
        guestCardName: guestCards.fullName,
        guestCardEmail: guestCards.email,
        guestCardPhone: guestCards.phone,
        conversationId: conversations.id,
        conversationProspectName: conversations.prospectName,
        conversationProspectEmail: conversations.prospectEmail,
        conversationProspectPhone: conversations.prospectPhone,
        ownerName: tourOwners.displayName,
      })
      .from(tourBookings)
      .innerJoin(properties, eq(properties.id, tourBookings.propertyId))
      .leftJoin(guestCards, eq(guestCards.id, tourBookings.guestCardId))
      .leftJoin(conversations, eq(conversations.id, tourBookings.conversationId))
      .leftJoin(tourOwners, eq(tourOwners.id, tourBookings.tourOwnerId))
      .where(eq(properties.orgId, orgId))
      .orderBy(desc(tourBookings.startAt))
      .limit(150),
    db
      .select({ value: count() })
      .from(conversations)
      .innerJoin(properties, eq(properties.id, conversations.propertyId))
      .where(eq(properties.orgId, orgId)),
  ]);

  const now = new Date();
  const upcomingTours = tourRows
    .filter((tour) => tour.status === 'booked' && tour.startAt.getTime() >= now.getTime())
    .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
  const pastTours = tourRows
    .filter((tour) => tour.status !== 'booked' || tour.startAt.getTime() < now.getTime())
    .sort((left, right) => right.startAt.getTime() - left.startAt.getTime());

  return {
    metrics: computeTourMetrics({
      tours: tourRows.map((tour) => ({
        status: tour.status,
        startAt: tour.startAt,
        conversationId: tour.conversationId,
      })),
      totalConversations: conversationCount,
      now,
    }),
    upcomingTours,
    pastTours,
  };
}

export async function getTourBookingForOrg(orgId: string, bookingId: string) {
  const [booking] = await db
    .select({
      id: tourBookings.id,
      propertyId: tourBookings.propertyId,
      guestCardId: tourBookings.guestCardId,
      conversationId: tourBookings.conversationId,
      status: tourBookings.status,
    })
    .from(tourBookings)
    .innerJoin(properties, eq(properties.id, tourBookings.propertyId))
    .where(and(eq(tourBookings.id, bookingId), eq(properties.orgId, orgId)))
    .limit(1);

  return booking ?? null;
}
