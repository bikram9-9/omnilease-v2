import { notFound } from 'next/navigation';
import { db, and, eq, properties, propertyKnowledge } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { KnowledgeClient } from './knowledge-client';

export default async function KnowledgePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [p] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) notFound();

  const rows = await db
    .select()
    .from(propertyKnowledge)
    .where(eq(propertyKnowledge.propertyId, id));

  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.content]));
  return <KnowledgeClient propertyId={id} knowledge={byCategory} />;
}
