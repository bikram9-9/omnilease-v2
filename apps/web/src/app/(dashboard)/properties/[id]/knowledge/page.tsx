import { notFound } from 'next/navigation';
import { db, and, eq, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { getPropertyContextDirectory, loadPropertyContext } from '@/lib/property-context';

export default async function PropertyContextPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [property] = await db
    .select({ id: properties.id, slug: properties.slug, name: properties.name })
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);

  if (!property) notFound();

  const sections = await loadPropertyContext(property.slug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Context files</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {property.name}
          {' · '}
          {getPropertyContextDirectory(property.slug)}
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
          No Markdown context files were found yet. Add files like `overview.md`, `amenities.md`,
          `policies.md`, `faqs.md`, and `touring.md` under this folder to enrich replies.
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.slug} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="text-lg font-medium">{section.title}</h2>
              <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{section.body}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
