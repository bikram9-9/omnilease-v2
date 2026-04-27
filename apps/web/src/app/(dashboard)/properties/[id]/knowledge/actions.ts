'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import {
  and,
  db,
  eq,
  properties,
  propertyKnowledgeSections,
  type PropertyKnowledgeSectionKey,
} from '@omnilease/db';
import { requireOrg } from '@/lib/auth';
import { PROPERTY_CONTEXT_FILES, validateKnowledgeSection } from '@/lib/property-context';

const validSections = new Set<PropertyKnowledgeSectionKey>(PROPERTY_CONTEXT_FILES.map((file) => file.slug));

function getSection(formData: FormData): PropertyKnowledgeSectionKey {
  const section = formData.get('section');
  if (typeof section !== 'string' || !validSections.has(section as PropertyKnowledgeSectionKey)) {
    throw new Error('Invalid knowledge section');
  }
  return section as PropertyKnowledgeSectionKey;
}

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

export async function saveKnowledgeSectionAction(propertyId: string, formData: FormData) {
  const { userId } = await assertPropertyAccess(propertyId);
  const section = getSection(formData);
  const file = PROPERTY_CONTEXT_FILES.find((item) => item.slug === section);
  const body = String(formData.get('body') ?? '').trim();
  const status = formData.get('publish') === 'true' ? 'published' : 'draft';
  const now = new Date();

  await db
    .insert(propertyKnowledgeSections)
    .values({
      propertyId,
      section,
      title: file?.title ?? section,
      body,
      status,
      source: 'manual',
      validationWarnings: validateKnowledgeSection(section, body),
      publishedAt: status === 'published' ? now : null,
      createdBy: userId,
      updatedBy: userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [propertyKnowledgeSections.propertyId, propertyKnowledgeSections.section],
      set: {
        title: file?.title ?? section,
        body,
        status,
        source: 'manual',
        validationWarnings: validateKnowledgeSection(section, body),
        publishedAt: status === 'published' ? now : null,
        updatedBy: userId,
        updatedAt: now,
      },
    });

  revalidatePath(`/properties/${propertyId}/knowledge`);
  revalidatePath(`/properties/${propertyId}`);
}

export async function importKnowledgeDraftAction(propertyId: string, formData: FormData) {
  const { userId } = await assertPropertyAccess(propertyId);
  const section = getSection(formData);
  const file = PROPERTY_CONTEXT_FILES.find((item) => item.slug === section);
  const sourceText = String(formData.get('sourceText') ?? '').trim();
  const importSource = String(formData.get('importSource') ?? '').trim().slice(0, 500) || null;
  if (!sourceText) throw new Error('Import text is required');

  const now = new Date();
  const draftBody = sourceText
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  await db
    .insert(propertyKnowledgeSections)
    .values({
      propertyId,
      section,
      title: file?.title ?? section,
      body: draftBody,
      status: 'draft',
      source: 'import',
      importSource,
      validationWarnings: validateKnowledgeSection(section, draftBody),
      createdBy: userId,
      updatedBy: userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [propertyKnowledgeSections.propertyId, propertyKnowledgeSections.section],
      set: {
        title: file?.title ?? section,
        body: draftBody,
        status: 'draft',
        source: 'import',
        importSource,
        validationWarnings: validateKnowledgeSection(section, draftBody),
        updatedBy: userId,
        updatedAt: now,
      },
    });

  revalidatePath(`/properties/${propertyId}/knowledge`);
  redirect(`/properties/${propertyId}/knowledge`);
}
