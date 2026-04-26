'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { and, db, eq, properties, propertyTourSettings } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { defaultTourSettings, parseTourSettingsForm } from '@/lib/tour-settings';

async function assertPropertyAccess(propertyId: string) {
  const { orgId, userId } = await requireOrg();
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
    .limit(1);
  if (!property) notFound();
  return { userId };
}

export async function saveTourSettingsAction(propertyId: string, formData: FormData) {
  const { userId } = await assertPropertyAccess(propertyId);
  const input = parseTourSettingsForm(formData);
  const now = new Date();

  await db
    .insert(propertyTourSettings)
    .values({
      propertyId,
      ...input,
      updatedBy: userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [propertyTourSettings.propertyId],
      set: {
        ...input,
        updatedBy: userId,
        updatedAt: now,
      },
    });

  revalidatePath(`/properties/${propertyId}/tours`);
  revalidatePath(`/properties/${propertyId}`);
}

export async function resetTourSettingsAction(propertyId: string) {
  const { userId } = await assertPropertyAccess(propertyId);
  const now = new Date();

  await db
    .insert(propertyTourSettings)
    .values({
      propertyId,
      ...defaultTourSettings,
      updatedBy: userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [propertyTourSettings.propertyId],
      set: {
        ...defaultTourSettings,
        updatedBy: userId,
        updatedAt: now,
      },
    });

  revalidatePath(`/properties/${propertyId}/tours`);
  redirect(`/properties/${propertyId}/tours`);
}
