'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { and, db, eq, properties, propertyAssistantSettings, sql } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { defaultAssistantSettings, parseAssistantSettingsForm } from '@/lib/assistant-settings';

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

export async function saveAssistantSettingsAction(propertyId: string, formData: FormData) {
  const { userId } = await assertPropertyAccess(propertyId);
  const input = parseAssistantSettingsForm(formData);
  const now = new Date();

  await db
    .insert(propertyAssistantSettings)
    .values({
      propertyId,
      ...input,
      version: 1,
      updatedBy: userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [propertyAssistantSettings.propertyId],
      set: {
        ...input,
        version: sql`${propertyAssistantSettings.version} + 1`,
        updatedBy: userId,
        updatedAt: now,
      },
    });

  revalidatePath(`/properties/${propertyId}/assistant`);
  revalidatePath(`/properties/${propertyId}`);
}

export async function resetAssistantSettingsAction(propertyId: string) {
  const { userId } = await assertPropertyAccess(propertyId);
  const now = new Date();

  await db
    .insert(propertyAssistantSettings)
    .values({
      propertyId,
      ...defaultAssistantSettings,
      version: 1,
      updatedBy: userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [propertyAssistantSettings.propertyId],
      set: {
        ...defaultAssistantSettings,
        version: sql`${propertyAssistantSettings.version} + 1`,
        updatedBy: userId,
        updatedAt: now,
      },
    });

  revalidatePath(`/properties/${propertyId}/assistant`);
  redirect(`/properties/${propertyId}/assistant`);
}
