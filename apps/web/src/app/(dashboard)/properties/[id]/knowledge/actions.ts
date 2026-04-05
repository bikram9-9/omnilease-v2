'use server';

import { revalidatePath } from 'next/cache';
import { db, and, eq, propertyKnowledge, properties } from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { knowledgeSchemas, type EditableKnowledgeCategory } from '@/lib/validators';

export async function upsertKnowledge(
  propertyId: string,
  category: EditableKnowledgeCategory,
  input: unknown,
) {
  const { orgId } = await requireOrg();
  const [p] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) throw new Error('Property not found');

  const schema = knowledgeSchemas[category];
  const content = schema.parse(input);

  const [existing] = await db
    .select({ id: propertyKnowledge.id })
    .from(propertyKnowledge)
    .where(and(
      eq(propertyKnowledge.propertyId, propertyId),
      eq(propertyKnowledge.category, category),
    ))
    .limit(1);

  if (existing) {
    await db
      .update(propertyKnowledge)
      .set({ content, updatedAt: new Date() })
      .where(eq(propertyKnowledge.id, existing.id));
  } else {
    await db.insert(propertyKnowledge).values({ propertyId, category, content });
  }

  revalidatePath(`/properties/${propertyId}/knowledge`);
}
