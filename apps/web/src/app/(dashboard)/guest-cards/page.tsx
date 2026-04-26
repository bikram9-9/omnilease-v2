import Link from 'next/link';
import { AlertTriangle, MessageSquare } from 'lucide-react';
import { requireOrg } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatConversationTime } from '@/components/conversations/helpers';
import { getGuestCardDisplayName, getStageLabel, listGuestCardsForOrg } from './queries';

export default async function GuestCardsPage() {
  const { orgId } = await requireOrg();
  const guestCards = await listGuestCardsForOrg(orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Guest cards</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Centralized lead profiles with cross-property conversation history and duplicate review.
        </p>
      </div>

      {guestCards.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="py-12 text-center text-zinc-400">
            No guest cards yet. New widget conversations will create them automatically.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {guestCards.map((guestCard) => (
            <Link key={guestCard.id} href={`/guest-cards/${guestCard.id}`}>
              <Card className="border-zinc-800 bg-zinc-900 transition hover:border-zinc-700 hover:bg-zinc-900/90">
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <CardTitle>{getGuestCardDisplayName(guestCard)}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span className="rounded-full border border-cyan-900/70 bg-cyan-950/60 px-2 py-1 text-cyan-200">
                        {getStageLabel(guestCard.stage)}
                      </span>
                      {guestCard.propertyName && <span>{guestCard.propertyName}</span>}
                      {guestCard.moveInDate && <span>Move-in {guestCard.moveInDate}</span>}
                      {guestCard.unitPreference && <span>{guestCard.unitPreference}</span>}
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500">
                    {formatConversationTime(guestCard.lastSeenAt)}
                  </div>
                </CardHeader>

                <CardContent className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
                  {guestCard.email && <span>{guestCard.email}</span>}
                  {guestCard.phone && <span>{guestCard.phone}</span>}
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {guestCard.conversationCount}
                  </span>
                  {guestCard.openDuplicateCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {guestCard.openDuplicateCount} duplicate
                    </span>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
