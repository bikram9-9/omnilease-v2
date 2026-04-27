'use server';

import { revalidatePath } from 'next/cache';
import {
  and,
  db,
  eq,
  conversations,
  guestCardActivities,
  guestCards,
  tourBookings,
  type TourBookingStatus,
} from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { getTourStatusLabel, tourDashboardStatuses } from '@/lib/tour-reporting';
import { getTourBookingForOrg } from './queries';

export async function updateTourStatusAction(formData: FormData) {
  const { orgId } = await requireOrg();
  const bookingId = String(formData.get('bookingId') ?? '');
  const status = String(formData.get('status') ?? '') as TourBookingStatus;

  if (!bookingId || !tourDashboardStatuses.includes(status)) return;

  const booking = await getTourBookingForOrg(orgId, bookingId);
  if (!booking) return;

  const now = new Date();
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tourBookings)
      .set({
        status,
        cancelledAt: status === 'cancelled' ? now : null,
        updatedAt: now,
      })
      .where(and(eq(tourBookings.id, booking.id), eq(tourBookings.propertyId, booking.propertyId)))
      .returning();

    if (!updated) return;

    if (status === 'converted') {
      if (updated.conversationId) {
        await tx
          .update(conversations)
          .set({ status: 'converted', updatedAt: now })
          .where(eq(conversations.id, updated.conversationId));
      }
      if (updated.guestCardId) {
        await tx
          .update(guestCards)
          .set({ stage: 'applied', updatedAt: now, lastSeenAt: now })
          .where(eq(guestCards.id, updated.guestCardId));
      }
    }

    if (updated.guestCardId) {
      await tx.insert(guestCardActivities).values({
        guestCardId: updated.guestCardId,
        propertyId: updated.propertyId,
        conversationId: updated.conversationId,
        eventType: 'tour',
        title: `Tour marked ${getTourStatusLabel(status).toLowerCase()}`,
        metadata: {
          tourBookingId: updated.id,
          status,
          previousStatus: booking.status,
        },
      });
    }
  });

  revalidatePath('/tours');
  revalidatePath(`/properties/${booking.propertyId}/tours`);
  if (booking.guestCardId) revalidatePath(`/guest-cards/${booking.guestCardId}`);
  if (booking.conversationId) revalidatePath(`/conversations/${booking.conversationId}`);
}
