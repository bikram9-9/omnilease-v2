import type { TourBookingStatus } from '@omnilease/db';

export const tourDashboardStatuses = [
  'booked',
  'completed',
  'no_show',
  'converted',
  'cancelled',
] as const satisfies TourBookingStatus[];

export type TourDashboardStatus = (typeof tourDashboardStatuses)[number];

export type TourMetricInput = {
  status: TourBookingStatus;
  startAt: Date;
  conversationId: string | null;
};

export function getTourStatusLabel(status: TourBookingStatus): string {
  switch (status) {
    case 'booked':
      return 'Scheduled';
    case 'completed':
      return 'Completed';
    case 'no_show':
      return 'No-show';
    case 'converted':
      return 'Converted';
    case 'cancelled':
      return 'Canceled';
  }
}

export function getTourStatusClasses(status: TourBookingStatus): string {
  switch (status) {
    case 'booked':
      return 'border-cyan-900/70 bg-cyan-950/60 text-cyan-200';
    case 'completed':
      return 'border-emerald-900/70 bg-emerald-950/60 text-emerald-200';
    case 'converted':
      return 'border-violet-900/70 bg-violet-950/60 text-violet-200';
    case 'no_show':
      return 'border-amber-900/70 bg-amber-950/60 text-amber-200';
    case 'cancelled':
      return 'border-zinc-800 bg-zinc-900 text-zinc-300';
  }
}

export function computeTourMetrics(input: {
  tours: TourMetricInput[];
  totalConversations: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const uniqueTourConversationIds = new Set(
    input.tours
      .map((tour) => tour.conversationId)
      .filter((id): id is string => Boolean(id)),
  );
  const totalTours = input.tours.length;
  const bookedTours = input.tours.filter((tour) => tour.status === 'booked');
  const completedTours = input.tours.filter((tour) => tour.status === 'completed' || tour.status === 'converted');
  const noShowTours = input.tours.filter((tour) => tour.status === 'no_show');
  const outcomeTours = input.tours.filter((tour) => (
    tour.status === 'completed'
    || tour.status === 'converted'
    || tour.status === 'no_show'
    || tour.status === 'cancelled'
  ));

  return {
    totalTours,
    upcomingTours: bookedTours.filter((tour) => tour.startAt.getTime() >= now.getTime()).length,
    pastScheduledTours: bookedTours.filter((tour) => tour.startAt.getTime() < now.getTime()).length,
    completedTours: completedTours.length,
    noShowTours: noShowTours.length,
    bookingRate: percent(uniqueTourConversationIds.size, input.totalConversations),
    completionRate: percent(completedTours.length, outcomeTours.length),
    noShowRate: percent(noShowTours.length, outcomeTours.length),
  };
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}
