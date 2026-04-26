import { notFound } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import { db, and, eq, properties, propertyKnowledgeSections } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  PROPERTY_CONTEXT_FILES,
  getPropertyContextDirectory,
  loadPropertyContext,
  validateKnowledgeSection,
} from '@/lib/property-context';
import { importKnowledgeDraftAction, saveKnowledgeSectionAction } from './actions';

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

  const [sections, dbSections] = await Promise.all([
    loadPropertyContext(property.slug, property.id),
    db
      .select()
      .from(propertyKnowledgeSections)
      .where(eq(propertyKnowledgeSections.propertyId, property.id)),
  ]);
  const sectionBySlug = new Map(dbSections.map((section) => [section.section, section]));
  const markdownBySlug = new Map(sections.map((section) => [section.slug, section]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {property.name}
          {' · '}
          {getPropertyContextDirectory(property.slug)}
        </p>
      </div>

      <div className="space-y-4">
        {PROPERTY_CONTEXT_FILES.map((file) => {
          const saved = sectionBySlug.get(file.slug);
          const markdown = markdownBySlug.get(file.slug);
          const body = saved?.body ?? markdown?.body ?? '';
          const warnings = saved?.validationWarnings ?? validateKnowledgeSection(file.slug, body);
          const isPublished = saved?.status === 'published';
          const formAction = saveKnowledgeSectionAction.bind(null, property.id);
          const importAction = importKnowledgeDraftAction.bind(null, property.id);

          return (
            <section key={file.slug} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium">{file.title}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {saved
                      ? `${saved.status} · ${saved.source} · updated ${saved.updatedAt.toLocaleString()}`
                      : markdown
                        ? 'Markdown fallback'
                        : 'No content yet'}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                  isPublished
                    ? 'border-emerald-900/70 bg-emerald-950/50 text-emerald-200'
                    : 'border-amber-900/70 bg-amber-950/50 text-amber-200'
                }`}
                >
                  {isPublished ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {isPublished ? 'Published' : 'Draft needed'}
                </span>
              </div>

              {warnings.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-900/70 bg-amber-950/40 p-3 text-sm text-amber-100">
                  {warnings.join(' ')}
                </div>
              )}

              <form action={formAction} className="mt-4 space-y-3">
                <input type="hidden" name="section" value={file.slug} />
                <Textarea
                  name="body"
                  defaultValue={body}
                  className="min-h-44 border-zinc-800 bg-zinc-900 text-zinc-100"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="submit" name="publish" value="false" variant="outline">
                    Save draft
                  </Button>
                  <Button type="submit" name="publish" value="true">
                    Publish
                  </Button>
                </div>
              </form>

              <details className="mt-4 rounded-md border border-zinc-800 p-3">
                <summary className="cursor-pointer text-sm text-zinc-300">
                  <Upload className="mr-2 inline h-3.5 w-3.5" />
                  Import draft text
                </summary>
                <form action={importAction} className="mt-3 space-y-3">
                  <input type="hidden" name="section" value={file.slug} />
                  <Input
                    name="importSource"
                    placeholder="Source URL or document name"
                    className="border-zinc-800 bg-zinc-900"
                  />
                  <Textarea
                    name="sourceText"
                    required
                    placeholder="Paste website or document text for review..."
                    className="min-h-28 border-zinc-800 bg-zinc-900"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" variant="outline">Create draft</Button>
                  </div>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
