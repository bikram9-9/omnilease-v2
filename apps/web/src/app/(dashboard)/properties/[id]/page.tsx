import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, and, eq, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getPropertyContextDirectory } from '@/lib/property-context';

export default async function PropertyDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [p] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) notFound();

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
        </TabsList>
      </Tabs>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-zinc-400">Slug</dt><dd>{p.slug}</dd></div>
        <div><dt className="text-zinc-400">Timezone</dt><dd>{p.timezone}</dd></div>
        <div><dt className="text-zinc-400">Website widget ID</dt><dd>{p.websiteWidgetId ?? '—'}</dd></div>
        <div><dt className="text-zinc-400">Messenger page ID</dt><dd>{p.messengerPageId ?? '—'}</dd></div>
        <div className="col-span-2">
          <dt className="text-zinc-400">Markdown context folder</dt>
          <dd>{getPropertyContextDirectory(p.slug)}</dd>
        </div>
      </dl>
    </div>
  );
}
