'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { and, db, eq, properties, type PropertyLaunchMode } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { parseReadinessTestResults } from '@/lib/readiness';

const launchModes: PropertyLaunchMode[] = ['draft', 'monitor', 'allowlist', 'production'];

export async function updatePropertyReadinessAction(propertyId: string, formData: FormData) {
  const { orgId } = await requireOrg();
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
    .limit(1);
  if (!property) notFound();

  const requestedMode = String(formData.get('launchMode') ?? 'draft') as PropertyLaunchMode;
  const launchMode = launchModes.includes(requestedMode) ? requestedMode : 'draft';
  const readinessTestResults = parseReadinessTestResults(String(formData.get('readinessTestResults') ?? ''));

  await db
    .update(properties)
    .set({
      launchMode,
      readinessTestResults,
      updatedAt: new Date(),
    })
    .where(eq(properties.id, propertyId));

  revalidatePath(`/properties/${propertyId}`);
}
