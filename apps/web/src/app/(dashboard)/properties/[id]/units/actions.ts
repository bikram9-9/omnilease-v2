'use server';

import { revalidatePath } from 'next/cache';
import { db, and, eq, unitTypes, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { unitTypeInput, type UnitTypeInput } from '@/lib/validators';

async function assertPropertyBelongsToOrg(propertyId: string) {
  const { orgId } = await requireOrg();
  const [p] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) throw new Error('Property not found');
  return orgId;
}

export async function createUnitType(propertyId: string, input: UnitTypeInput) {
  await assertPropertyBelongsToOrg(propertyId);
  const data = unitTypeInput.parse(input);
  await db.insert(unitTypes).values({
    propertyId,
    name: data.name,
    bedrooms: data.bedrooms,
    bathrooms: String(data.bathrooms),
    sqftMin: data.sqftMin ?? null,
    sqftMax: data.sqftMax ?? null,
    priceMin: data.priceMin != null ? String(data.priceMin) : null,
    priceMax: data.priceMax != null ? String(data.priceMax) : null,
    availableCount: data.availableCount,
    deposit: data.deposit != null ? String(data.deposit) : null,
    description: data.description ?? null,
  });
  revalidatePath(`/properties/${propertyId}/units`);
}

export async function updateUnitType(propertyId: string, unitId: string, input: UnitTypeInput) {
  await assertPropertyBelongsToOrg(propertyId);
  const data = unitTypeInput.parse(input);
  await db
    .update(unitTypes)
    .set({
      name: data.name,
      bedrooms: data.bedrooms,
      bathrooms: String(data.bathrooms),
      sqftMin: data.sqftMin ?? null,
      sqftMax: data.sqftMax ?? null,
      priceMin: data.priceMin != null ? String(data.priceMin) : null,
      priceMax: data.priceMax != null ? String(data.priceMax) : null,
      availableCount: data.availableCount,
      deposit: data.deposit != null ? String(data.deposit) : null,
      description: data.description ?? null,
    })
    .where(and(eq(unitTypes.id, unitId), eq(unitTypes.propertyId, propertyId)));
  revalidatePath(`/properties/${propertyId}/units`);
}

export async function deleteUnitType(propertyId: string, unitId: string) {
  await assertPropertyBelongsToOrg(propertyId);
  await db
    .delete(unitTypes)
    .where(and(eq(unitTypes.id, unitId), eq(unitTypes.propertyId, propertyId)));
  revalidatePath(`/properties/${propertyId}/units`);
}
