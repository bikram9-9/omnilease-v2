import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, GitMerge, RotateCcw } from 'lucide-react';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  formatConversationTime,
  getChannelClasses,
  getChannelLabel,
  getStatusClasses,
  getStatusLabel,
} from '@/components/conversations/helpers';
import {
  getGuestCardDetailForOrg,
  getGuestCardDisplayName,
  getStageLabel,
} from '../queries';
import {
  cancelScheduledFollowUpAction,
  mergeDuplicateGuestCardAction,
  revertGuestCardMergeAction,
} from './actions';

export default async function GuestCardDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const {
    guestCard,
    properties,
    conversations,
    activities,
    tours,
    scheduledFollowUps,
    duplicates,
    mergeAudits,
  } = await getGuestCardDetailForOrg(orgId, id);

  if (!guestCard) notFound();

  const timelineByType = {
    tours: activities.filter((activity) => activity.eventType === 'tour'),
    quotes: activities.filter((activity) => activity.eventType === 'quote' || activity.eventType === 'application'),
    tasks: activities.filter((activity) => activity.eventType === 'task'),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href="/guest-cards" className="text-sm text-zinc-500 hover:text-zinc-300">
            Back to guest cards
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">{getGuestCardDisplayName(guestCard)}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Last seen {formatConversationTime(guestCard.lastSeenAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-cyan-900/70 bg-cyan-950/60 px-2 py-1 text-cyan-200">
              {getStageLabel(guestCard.stage)}
            </span>
            {guestCard.primaryPropertyName && (
              <span className="rounded-full border border-zinc-800 px-2 py-1 text-zinc-300">
                {guestCard.primaryPropertyName}
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/guest-cards/${guestCard.id}/export`}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-background bg-clip-padding px-2.5 text-sm font-medium outline-none transition-all select-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px dark:border-input dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <Download className="h-4 w-4" />
          Export
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {conversations.length === 0 ? (
                <p className="text-sm text-zinc-400">No linked conversations yet.</p>
              ) : (
                conversations.map((conversation, index) => (
                  <div key={conversation.id} className="space-y-3">
                    {index > 0 && <Separator className="bg-zinc-800" />}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <Link
                          href={`/conversations/${conversation.id}`}
                          className="font-medium text-zinc-100 hover:text-zinc-300"
                        >
                          {conversation.propertyName}
                        </Link>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className={`rounded-full border px-2 py-1 ${getStatusClasses(conversation.status)}`}>
                            {getStatusLabel(conversation.status)}
                          </span>
                          <span className={`rounded-full border px-2 py-1 ${getChannelClasses(conversation.channel)}`}>
                            {getChannelLabel(conversation.channel)}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {formatConversationTime(conversation.updatedAt)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-zinc-300">
                      {conversation.latestMessage?.content ?? 'No messages captured yet.'}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-sm text-zinc-400">No activity has been recorded yet.</p>
              ) : (
                activities.map((activity, index) => (
                  <div key={activity.id} className="space-y-2">
                    {index > 0 && <Separator className="bg-zinc-800" />}
                    <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                      <span className="uppercase">{activity.eventType}</span>
                      <span>{formatConversationTime(activity.occurredAt)}</span>
                    </div>
                    <p className="text-sm text-zinc-200">{activity.title}</p>
                    {activity.description && (
                      <p className="text-sm text-zinc-400">{activity.description}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TimelineSummary title="Tours" count={timelineByType.tours.length} />
            <TimelineSummary title="Quotes" count={timelineByType.quotes.length} />
            <TimelineSummary title="Tasks" count={timelineByType.tasks.length} />
          </div>
        </div>

        <div className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Name" value={guestCard.fullName} />
              <DetailRow label="Email" value={guestCard.email} />
              <DetailRow label="Phone" value={guestCard.phone} />
              <DetailRow label="Move-in date" value={guestCard.moveInDate} />
              <DetailRow label="Unit preference" value={guestCard.unitPreference} />
              <DetailRow label="Source" value={guestCard.source} />
              <DetailRow label="Email consent" value={guestCard.emailConsentStatus} />
              <DetailRow label="SMS consent" value={guestCard.smsConsentStatus} />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Scheduled Follow-ups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {scheduledFollowUps.length === 0 ? (
                <p className="text-sm text-zinc-400">No scheduled automation.</p>
              ) : (
                scheduledFollowUps.map((job, index) => (
                  <div key={job.id} className="space-y-3">
                    {index > 0 && <Separator className="bg-zinc-800" />}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-100">
                          {formatJobType(job.jobType)}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {job.recipientKind} - {job.channel} - due {formatConversationTime(job.nextAttemptAt)}
                        </div>
                      </div>
                      <span className="rounded-full border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
                        {job.status}
                      </span>
                    </div>
                    {job.lastError && (
                      <p className="text-xs text-amber-300">{job.lastError}</p>
                    )}
                    {(job.status === 'pending' || job.status === 'failed') && (
                      <form action={cancelScheduledFollowUpAction}>
                        <input type="hidden" name="guestCardId" value={guestCard.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Cancel
                        </Button>
                      </form>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Tours</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {tours.length === 0 ? (
                <p className="text-sm text-zinc-400">No tours linked yet.</p>
              ) : (
                tours.map((tour, index) => (
                  <div key={tour.id} className="space-y-2">
                    {index > 0 && <Separator className="bg-zinc-800" />}
                    <div className="text-sm font-medium text-zinc-100">
                      {formatTourWindow(tour.startAt, tour.endAt, tour.timezone)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {tour.tourType} - {tour.status} - {tour.ownerAssignmentStatus}
                    </div>
                    <div className="text-sm text-zinc-300">
                      Owner: {tour.ownerName ?? 'Manual assignment needed'}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {properties.length === 0 ? (
                <p className="text-sm text-zinc-400">No property links yet.</p>
              ) : (
                properties.map((property) => (
                  <div key={property.id} className="text-sm">
                    <Link href={`/properties/${property.id}`} className="text-zinc-100 hover:text-zinc-300">
                      {property.name}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      {property.source} - {formatConversationTime(property.lastSeenAt)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Duplicates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {duplicates.length === 0 ? (
                <p className="text-sm text-zinc-400">No open duplicate candidates.</p>
              ) : (
                duplicates.map((duplicate, index) => (
                  <div key={duplicate.candidateId} className="space-y-3">
                    {index > 0 && <Separator className="bg-zinc-800" />}
                    <div>
                      <Link
                        href={`/guest-cards/${duplicate.otherCard.id}`}
                        className="text-sm font-medium text-zinc-100 hover:text-zinc-300"
                      >
                        {getGuestCardDisplayName(duplicate.otherCard)}
                      </Link>
                      <p className="mt-1 text-xs text-zinc-500">
                        {duplicate.matchReasons.join(', ')} - {duplicate.confidence}
                      </p>
                    </div>
                    <form action={mergeDuplicateGuestCardAction}>
                      <input type="hidden" name="targetGuestCardId" value={guestCard.id} />
                      <input type="hidden" name="sourceGuestCardId" value={duplicate.otherCard.id} />
                      <input type="hidden" name="duplicateCandidateId" value={duplicate.candidateId} />
                      <Button type="submit" size="sm" variant="outline">
                        <GitMerge className="h-3.5 w-3.5" />
                        Merge
                      </Button>
                    </form>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950">
            <CardHeader>
              <CardTitle>Merge audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {mergeAudits.length === 0 ? (
                <p className="text-sm text-zinc-400">No merge audit rows yet.</p>
              ) : (
                mergeAudits.map((audit, index) => (
                  <div key={audit.id} className="space-y-3">
                    {index > 0 && <Separator className="bg-zinc-800" />}
                    <div className="text-sm text-zinc-300">
                      Merged {formatConversationTime(audit.mergedAt)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Source {audit.sourceGuestCardId.slice(0, 8)} into {audit.targetGuestCardId.slice(0, 8)}
                    </div>
                    {audit.revertedAt ? (
                      <p className="text-xs text-zinc-500">
                        Reverted {formatConversationTime(audit.revertedAt)}
                      </p>
                    ) : audit.reversible ? (
                      <form action={revertGuestCardMergeAction}>
                        <input type="hidden" name="guestCardId" value={guestCard.id} />
                        <input type="hidden" name="mergeAuditId" value={audit.id} />
                        <Button type="submit" size="sm" variant="outline">
                          <RotateCcw className="h-3.5 w-3.5" />
                          Revert
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 break-words text-zinc-200">{value ?? '-'}</div>
    </div>
  );
}

function TimelineSummary({ title, count }: { title: string; count: number }) {
  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardContent className="py-5">
        <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
        <div className="mt-2 text-2xl font-semibold text-zinc-50">{count}</div>
      </CardContent>
    </Card>
  );
}

function formatJobType(jobType: string) {
  return jobType.replace(/_/g, ' ');
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
