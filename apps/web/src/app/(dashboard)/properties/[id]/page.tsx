import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { db, and, eq, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getPropertyContextDirectory } from '@/lib/property-context';

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
        <Button variant="outline" render={<Link href={`/properties/${p.id}/edit`}>Edit</Link>} />
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" render={<Link href={`/properties/${p.id}`}>Details</Link>} />
          <TabsTrigger value="units" render={<Link href={`/properties/${p.id}/units`}>Units</Link>} />
          <TabsTrigger value="knowledge" render={<Link href={`/properties/${p.id}/knowledge`}>Knowledge</Link>} />
          <TabsTrigger value="assistant" render={<Link href={`/properties/${p.id}/assistant`}>Assistant</Link>} />
        </TabsList>
      </Tabs>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-zinc-400">Slug</dt><dd>{p.slug}</dd></div>
        <div><dt className="text-zinc-400">Timezone</dt><dd>{p.timezone}</dd></div>
        <div><dt className="text-zinc-400">Website widget ID</dt><dd>{p.websiteWidgetId ?? '—'}</dd></div>
        <div><dt className="text-zinc-400">Messenger page ID</dt><dd>{p.messengerPageId ?? '—'}</dd></div>
        <div><dt className="text-zinc-400">Escalation email</dt><dd>{p.escalationEmail ?? '—'}</dd></div>
        <div className="col-span-2">
          <dt className="text-zinc-400">Markdown context folder</dt>
          <dd>{getPropertyContextDirectory(p.slug)}</dd>
        </div>
      </dl>

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
