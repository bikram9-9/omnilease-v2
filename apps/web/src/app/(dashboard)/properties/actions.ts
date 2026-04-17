'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, and, eq, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { propertyInput, type PropertyInput } from '@/lib/validators';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'property';
}

function emptyToNull(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function ensureUniquePropertySlug(base: string, excludeId?: string): Promise<string> {
  const baseSlug = slugify(base);
  let candidate = baseSlug;
  let attempt = 2;

  while (true) {
    const [existing] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.slug, candidate))
      .limit(1);

    if (!existing || existing.id === excludeId) {
      return candidate;
    }

    candidate = `${baseSlug}-${attempt}`;
    attempt += 1;
  }
}

export async function createProperty(input: PropertyInput) {
  const { orgId } = await requireOrg();
  const data = propertyInput.parse(input);
  const slug = await ensureUniquePropertySlug(data.slug || data.name);
  const [row] = await db
    .insert(properties)
    .values({
      orgId,
      slug,
      name: data.name,
      address: emptyToNull(data.address),
      city: emptyToNull(data.city),
      state: emptyToNull(data.state),
      zip: emptyToNull(data.zip),
      timezone: data.timezone,
      websiteWidgetId: emptyToNull(data.websiteWidgetId),
      messengerPageId: emptyToNull(data.messengerPageId),
      brandColor: emptyToNull(data.brandColor),
      welcomeMessage: emptyToNull(data.welcomeMessage),
    })
    .returning({ id: properties.id });
  revalidatePath('/properties');
  redirect(`/properties/${row.id}`);
}

export async function updateProperty(id: string, input: PropertyInput) {
  const { orgId } = await requireOrg();
  const data = propertyInput.parse(input);
  const slug = await ensureUniquePropertySlug(data.slug || data.name, id);
  await db
    .update(properties)
    .set({
      slug,
      name: data.name,
      address: emptyToNull(data.address),
      city: emptyToNull(data.city),
      state: emptyToNull(data.state),
      zip: emptyToNull(data.zip),
      timezone: data.timezone,
      websiteWidgetId: emptyToNull(data.websiteWidgetId),
      messengerPageId: emptyToNull(data.messengerPageId),
      brandColor: emptyToNull(data.brandColor),
      welcomeMessage: emptyToNull(data.welcomeMessage),
      updatedAt: new Date(),
    })
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)));
  revalidatePath(`/properties/${id}`);
  revalidatePath('/properties');
  redirect(`/properties/${id}`);
}

export async function deleteProperty(id: string) {
  const { orgId } = await requireOrg();
  await db
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)));
  revalidatePath('/properties');
  redirect('/properties');
}
