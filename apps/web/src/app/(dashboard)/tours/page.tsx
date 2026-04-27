import Link from 'next/link';
import { CalendarCheck2, CalendarClock, CheckCircle2, Percent, UserRoundCheck } from 'lucide-react';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  getTourStatusClasses,
  getTourStatusLabel,
  tourDashboardStatuses,
} from '@/lib/tour-reporting';
import { getTourDashboardForOrg, type TourDashboardRow } from './queries';
import { updateTourStatusAction } from './actions';

export default async function ToursDashboardPage() {
  const { orgId } = await requireOrg();
  const { metrics, upcomingTours, pastTours } = await getTourDashboardForOrg(orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tours</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Track scheduled tours, owner handoffs, outcomes, and conversion rates.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CalendarClock}
          label="Upcoming tours"
          value={metrics.upcomingTours}
          detail={`${metrics.pastScheduledTours} scheduled tours are past their start time`}
        />
        <MetricCard
          icon={Percent}
          label="Tour booking rate"
          value={`${metrics.bookingRate}%`}
          detail={`${metrics.totalTours} total booked tour records`}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Completion rate"
          value={`${metrics.completionRate}%`}
          detail={`${metrics.completedTours} completed or converted tours`}
        />
        <MetricCard
          icon={UserRoundCheck}
          label="No-show rate"
          value={`${metrics.noShowRate}%`}
          detail={`${metrics.noShowTours} tours marked no-show`}
        />
      </div>

      <TourSection title="Upcoming" emptyText="No upcoming tours are scheduled." tours={upcomingTours} />
      <TourSection title="Past and outcomes" emptyText="No past tours or outcomes yet." tours={pastTours} />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof CalendarCheck2;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-400">
          <Icon className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        <p className="mt-2 text-sm text-zinc-400">{detail}</p>
      </CardContent>
    </Card>
  );
}

function TourSection({
  title,
  emptyText,
  tours,
}: {
  title: string;
  emptyText: string;
  tours: TourDashboardRow[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="rounded-lg border border-zinc-800 bg-zinc-950">
        {tours.length === 0 ? (
          <p className="p-5 text-sm text-zinc-400">{emptyText}</p>
        ) : (
          tours.map((tour, index) => (
            <div key={tour.id}>
              {index > 0 && <Separator className="bg-zinc-800" />}
              <TourRow tour={tour} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function TourRow({ tour }: { tour: TourDashboardRow }) {
  const prospect = getProspectLabel(tour);

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_220px]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-xs ${getTourStatusClasses(tour.status)}`}>
            {getTourStatusLabel(tour.status)}
          </span>
          <span className="rounded-full border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
            {formatTourType(tour.tourType)}
          </span>
          <span className="rounded-full border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
            {tour.source}
          </span>
        </div>
        <div>
          <div className="font-medium text-zinc-100">{formatTourWindow(tour.startAt, tour.endAt, tour.timezone)}</div>
          <Link href={`/properties/${tour.propertyId}`} className="text-sm text-zinc-400 hover:text-zinc-200">
            {tour.propertyName}
          </Link>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Prospect</div>
          <div className="mt-1 text-zinc-200">{prospect}</div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {tour.conversationId && (
            <Link href={`/conversations/${tour.conversationId}`} className="text-zinc-400 hover:text-zinc-200">
              Conversation
            </Link>
          )}
          {tour.guestCardId && (
            <Link href={`/guest-cards/${tour.guestCardId}`} className="text-zinc-400 hover:text-zinc-200">
              Guest card
            </Link>
          )}
        </div>
        <div className="text-xs text-zinc-500">
          Owner: {tour.ownerName ?? 'Manual assignment needed'} · {tour.ownerAssignmentStatus}
        </div>
        {tour.ownerAssignmentReason && (
          <p className="text-xs text-amber-300">{tour.ownerAssignmentReason}</p>
        )}
      </div>

      <form action={updateTourStatusAction} className="flex items-end gap-2">
        <input type="hidden" name="bookingId" value={tour.id} />
        <select
          name="status"
          defaultValue={tour.status}
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100"
          aria-label="Tour status"
        >
          {tourDashboardStatuses.map((status) => (
            <option key={status} value={status}>{getTourStatusLabel(status)}</option>
          ))}
        </select>
        <Button type="submit" variant="outline">Update</Button>
      </form>
    </div>
  );
}

function getProspectLabel(tour: TourDashboardRow): string {
  return tour.guestCardName
    ?? tour.conversationProspectName
    ?? tour.guestCardEmail
    ?? tour.conversationProspectEmail
    ?? tour.guestCardPhone
    ?? tour.conversationProspectPhone
    ?? 'Unknown prospect';
}

function formatTourType(tourType: TourDashboardRow['tourType']): string {
  switch (tourType) {
    case 'in_person':
      return 'In-person';
    case 'virtual':
      return 'Virtual';
    case 'self_guided':
      return 'Self-guided';
  }
}

function formatTourWindow(startAt: Date, endAt: Date, timezone: string): string {
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(startAt);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} ${time.format(startAt)}-${time.format(endAt)}`;
}
