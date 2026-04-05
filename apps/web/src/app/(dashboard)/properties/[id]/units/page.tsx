import { notFound } from 'next/navigation';
import { db, and, eq, desc, properties, unitTypes } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { UnitsClient } from './units-client';

export default async function UnitsPage({
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

  const units = await db
    .select()
    .from(unitTypes)
    .where(eq(unitTypes.propertyId, id))
    .orderBy(desc(unitTypes.createdAt));

  return <UnitsClient propertyId={id} units={units} />;
}
