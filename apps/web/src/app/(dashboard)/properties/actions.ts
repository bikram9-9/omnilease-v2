'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, and, eq, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { propertyInput, type PropertyInput } from '@/lib/validators';

export async function createProperty(input: PropertyInput) {
  const { orgId } = await requireOrg();
  const data = propertyInput.parse(input);
  const [row] = await db
    .insert(properties)
    .values({ ...data, orgId })
    .returning({ id: properties.id });
  revalidatePath('/properties');
  redirect(`/properties/${row.id}`);
}

export async function updateProperty(id: string, input: PropertyInput) {
  const { orgId } = await requireOrg();
  const data = propertyInput.parse(input);
  await db
    .update(properties)
    .set({ ...data, updatedAt: new Date() })
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
