import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import {
  and,
  asc,
  db,
  eq,
  properties,
  propertyAssistantSettings,
  propertyKnowledgeSections,
  propertyTourSettings,
  tourOwners,
} from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getPropertyContextDirectory } from '@/lib/property-context';
import { buildWidgetDisclosureConfig, getWidgetReleaseReadiness } from '@/lib/widget-disclosure';
import {
  evaluatePropertyReadiness,
  formatReadinessTestResults,
  launchModeLabels,
  type ReadinessStatus,
} from '@/lib/readiness';
import { phaseBBlockingStoryIds, phaseBComplaintClusters } from '@/lib/phase-b-release-gate';
import { updatePropertyReadinessAction } from './readiness-actions';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export default async function PropertyDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost:3000';
  const protocol = requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const appOrigin = `${protocol}://${host}`;
  const [p] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) notFound();

  const widgetScriptUrl = `${appOrigin}/widget.js`;
  const widgetSnippet = p.websiteWidgetId
    ? `<script src="${widgetScriptUrl}" data-widget-id="${p.websiteWidgetId}" defer></script>`
    : '';
  const disclosure = buildWidgetDisclosureConfig(p);
  const widgetReadiness = getWidgetReleaseReadiness(p);
  const [knowledgeRows, assistantRows, tourSettingsRows, activeOwnerRows] = await Promise.all([
    db
      .select({
        section: propertyKnowledgeSections.section,
        status: propertyKnowledgeSections.status,
        validationWarnings: propertyKnowledgeSections.validationWarnings,
      })
      .from(propertyKnowledgeSections)
      .where(eq(propertyKnowledgeSections.propertyId, p.id))
      .orderBy(asc(propertyKnowledgeSections.section)),
    db
      .select({
        primaryGoal: propertyAssistantSettings.primaryGoal,
        ctaPreference: propertyAssistantSettings.ctaPreference,
        escalationTriggers: propertyAssistantSettings.escalationTriggers,
      })
      .from(propertyAssistantSettings)
      .where(eq(propertyAssistantSettings.propertyId, p.id))
      .limit(1),
    db
      .select({
        enabledTourTypes: propertyTourSettings.enabledTourTypes,
        tourHours: propertyTourSettings.tourHours,
        calendarProvider: propertyTourSettings.calendarProvider,
        calendarAuthStatus: propertyTourSettings.calendarAuthStatus,
        calendarLastCheckedAt: propertyTourSettings.calendarLastCheckedAt,
        calendarLastError: propertyTourSettings.calendarLastError,
      })
      .from(propertyTourSettings)
      .where(eq(propertyTourSettings.propertyId, p.id))
      .limit(1),
    db
      .select({ id: tourOwners.id })
      .from(tourOwners)
      .where(and(eq(tourOwners.propertyId, p.id), eq(tourOwners.isActive, 1))),
  ]);
  const readiness = evaluatePropertyReadiness({
    property: p,
    knowledgeSections: knowledgeRows,
    assistantSettings: assistantRows[0] ?? null,
    tourSettings: tourSettingsRows[0] ?? null,
    activeTourOwners: activeOwnerRows,
  });
  const readinessAction = updatePropertyReadinessAction.bind(null, p.id);
  const previewSrcDoc = p.websiteWidgetId
    ? `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body {
        margin: 0;
        min-height: 560px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f8fafc;
        color: #111827;
      }
      main { padding: 24px; max-width: 520px; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0; color: #4b5563; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(p.name)}</h1>
      <p>Widget preview page</p>
    </main>
    <script src="${escapeHtml(widgetScriptUrl)}" data-widget-id="${escapeHtml(p.websiteWidgetId)}" defer></script>
  </body>
</html>`
    : '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <p className="text-sm text-zinc-400">
            {[p.address, p.city, p.state, p.zip].filter(Boolean).join(', ') || '—'}
          </p>
        </div>
        <Button nativeButton={false} variant="outline" render={<Link href={`/properties/${p.id}/edit`}>Edit</Link>} />
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" render={<Link href={`/properties/${p.id}`}>Details</Link>} />
          <TabsTrigger value="units" render={<Link href={`/properties/${p.id}/units`}>Units</Link>} />
          <TabsTrigger value="knowledge" render={<Link href={`/properties/${p.id}/knowledge`}>Knowledge</Link>} />
          <TabsTrigger value="assistant" render={<Link href={`/properties/${p.id}/assistant`}>Assistant</Link>} />
          <TabsTrigger value="tours" render={<Link href={`/properties/${p.id}/tours`}>Tours</Link>} />
        </TabsList>
      </Tabs>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-zinc-400">Slug</dt><dd>{p.slug}</dd></div>
        <div><dt className="text-zinc-400">Timezone</dt><dd>{p.timezone}</dd></div>
        <div><dt className="text-zinc-400">Website widget ID</dt><dd>{p.websiteWidgetId ?? '—'}</dd></div>
        <div><dt className="text-zinc-400">Messenger page ID</dt><dd>{p.messengerPageId ?? '—'}</dd></div>
        <div><dt className="text-zinc-400">Escalation email</dt><dd>{p.escalationEmail ?? '—'}</dd></div>
        <div>
          <dt className="text-zinc-400">Release readiness</dt>
          <dd>{readiness.passed ? 'Ready' : 'Blocked'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-zinc-400">Markdown context folder</dt>
          <dd>{getPropertyContextDirectory(p.slug)}</dd>
        </div>
      </dl>

      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Phase B Go-Live Readiness</CardTitle>
            <CardDescription>
              Production exposure is blocked until trust, provider, owner, and validation-script gates pass.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <ReadinessStat label="Status" value={readiness.passed ? 'Ready' : 'Blocked'} />
              <ReadinessStat label="Mode" value={launchModeLabels[readiness.mode]} />
              <ReadinessStat label="Blockers" value={readiness.blockers.length} />
              <ReadinessStat
                label="Production exposure"
                value={readiness.canExposeProduction ? 'Allowed' : 'Blocked'}
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {readiness.items.map((item) => (
                <div key={item.key} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-zinc-100">{item.label}</div>
                    <span className={readinessBadgeClasses(item.status)}>
                      {item.status === 'passed' ? 'Ready' : item.status === 'warning' ? 'Review' : 'Blocked'}
                    </span>
                  </div>
                  <p className="mt-2 text-zinc-400">{item.detail}</p>
                  <p className="mt-2 text-xs text-zinc-500">{item.complaintPlanMapping}</p>
                </div>
              ))}
            </div>

            <form action={readinessAction} className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <label htmlFor="launchMode" className="text-sm font-medium text-zinc-100">Launch mode</label>
                <select
                  id="launchMode"
                  name="launchMode"
                  defaultValue={p.launchMode}
                  className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100"
                >
                  {Object.entries(launchModeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="readinessTestResults" className="text-sm font-medium text-zinc-100">
                  Launch validation results
                </label>
                <textarea
                  id="readinessTestResults"
                  name="readinessTestResults"
                  defaultValue={formatReadinessTestResults(p.readinessTestResults)}
                  placeholder="pricing | passed | conversation-id | notes"
                  className="min-h-24 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="outline">Save readiness</Button>
              </div>
            </form>

            <p className="text-xs text-zinc-500">
              Validation areas required before launch: pricing, availability, fees, tours, and human handoff.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Complaint-Derived Trust Gate</CardTitle>
            <CardDescription>
              OMN-153 maps public review failure modes to blocking stories, readiness checks, and launch evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <ReadinessStat label="Complaint clusters" value={phaseBComplaintClusters.length} />
              <ReadinessStat label="Blocking stories" value={phaseBBlockingStoryIds.length} />
              <ReadinessStat label="Property readiness" value={readiness.passed ? 'Passing' : 'Blocked'} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {phaseBComplaintClusters.map((cluster) => (
                <div key={cluster.key} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-zinc-100">{cluster.label}</div>
                    {cluster.blockerStories.map((issueId) => (
                      <span
                        key={issueId}
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300"
                      >
                        {issueId}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-zinc-400">{cluster.complaintRisk}</p>
                  <p className="mt-2 text-xs text-zinc-500">{cluster.releaseProof}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-zinc-500">
              Final release approval requires proof comments for every blocking story plus browser/live evidence where
              the cluster calls for it.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Widget Disclosure Preview</CardTitle>
            <CardDescription>Exact first assistant message and fallback context shown by the widget.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="mb-1 font-medium text-zinc-100">First assistant message</div>
              <div className="whitespace-pre-line rounded-lg border bg-zinc-950 p-3 text-zinc-100">
                {disclosure.initialAssistantMessage}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-zinc-400">Privacy notice</div>
                <div className="break-words">{disclosure.privacyNoticeUrl ?? disclosure.privacyDisclosureText ?? '—'}</div>
              </div>
              <div>
                <div className="text-zinc-400">Terms</div>
                <div className="break-words">{disclosure.termsUrl ?? '—'}</div>
              </div>
            </div>
            <div>
              <div className="text-zinc-400">Human/property contact fallback</div>
              <div className="break-words">
                {disclosure.contactFallbackText
                  ?? disclosure.contactFallbackLabel
                  ?? disclosure.contactFallbackUrl
                  ?? '—'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Launch Checklist</CardTitle>
            <CardDescription>Disclosure and fallback requirements for first production release.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {widgetReadiness.items.map((item) => (
              <div key={item.key} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-zinc-100">{item.label}</div>
                  <span
                    className={
                      item.passed
                        ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300'
                        : 'rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300'
                    }
                  >
                    {item.passed ? 'Ready' : 'Blocked'}
                  </span>
                </div>
                <div className="mt-1 text-zinc-400">{item.detail}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Website Widget</CardTitle>
            <CardDescription>Install snippet and current property channel identifiers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {p.websiteWidgetId ? (
              <>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-zinc-400">Widget ID</div>
                    <div className="font-mono">{p.websiteWidgetId}</div>
                  </div>
                  <div>
                    <div className="text-zinc-400">Script source</div>
                    <div className="break-all font-mono">{widgetScriptUrl}</div>
                  </div>
                </div>
                <pre className="overflow-x-auto rounded-lg border bg-zinc-950 p-3 text-xs text-zinc-50">
                  <code>{widgetSnippet}</code>
                </pre>
              </>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Add a website widget ID before installing or previewing this property widget.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Open the launcher in the lower-right corner to start a test chat.</CardDescription>
          </CardHeader>
          <CardContent>
            {p.websiteWidgetId ? (
              <iframe
                title={`${p.name} website widget preview`}
                className="h-[560px] w-full rounded-lg border bg-white"
                sandbox="allow-scripts allow-forms allow-same-origin"
                srcDoc={previewSrcDoc}
              />
            ) : (
              <div className="flex h-[260px] items-center justify-center rounded-lg border bg-zinc-50 text-sm text-zinc-500">
                Widget preview unavailable
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ReadinessStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function readinessBadgeClasses(status: ReadinessStatus) {
  switch (status) {
    case 'passed':
      return 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300';
    case 'warning':
      return 'rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300';
    case 'failed':
      return 'rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300';
  }
}
