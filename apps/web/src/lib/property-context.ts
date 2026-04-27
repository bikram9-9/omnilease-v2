import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  db,
  eq,
  propertyKnowledgeSections,
  type PropertyKnowledgeSectionKey,
  type PropertyKnowledgeStatus,
} from '@omnilease/db';

export type PropertyContextSection = {
  slug: PropertyKnowledgeSectionKey;
  title: string;
  filename: string;
  body: string;
  status?: PropertyKnowledgeStatus;
  source?: 'database' | 'markdown';
  validationWarnings?: string[];
  updatedAt?: Date;
};

export const PROPERTY_CONTEXT_FILES = [
  { slug: 'overview', title: 'Overview', filename: 'overview.md' },
  { slug: 'amenities', title: 'Amenities', filename: 'amenities.md' },
  { slug: 'policies', title: 'Policies', filename: 'policies.md' },
  { slug: 'faqs', title: 'FAQs', filename: 'faqs.md' },
  { slug: 'touring', title: 'Touring', filename: 'touring.md' },
] as const satisfies ReadonlyArray<{
  slug: PropertyKnowledgeSectionKey;
  title: string;
  filename: string;
}>;

export function getPropertyContextDirectory(propertySlug: string): string {
  return path.join('content', 'properties', propertySlug);
}

export function validateKnowledgeSection(slug: PropertyKnowledgeSectionKey, body: string): string[] {
  const warnings: string[] = [];
  const trimmed = body.trim();
  if (!trimmed) warnings.push('Section is empty.');
  if (trimmed.length > 0 && trimmed.length < 40) warnings.push('Section is very short.');
  if (slug === 'policies' && !/pet|fee|deposit|parking|application|income/i.test(trimmed)) {
    warnings.push('Policies should mention core leasing policies such as pets, fees, deposits, parking, or application requirements.');
  }
  if (slug === 'touring' && !/tour|appointment|visit|hours|schedule/i.test(trimmed)) {
    warnings.push('Touring should explain how prospects can tour or schedule time with the leasing team.');
  }
  return warnings;
}

export async function loadPropertyContext(
  propertySlug: string,
  propertyId?: string,
): Promise<PropertyContextSection[]> {
  if (propertyId) {
    const rows = await db
      .select()
      .from(propertyKnowledgeSections)
      .where(eq(propertyKnowledgeSections.propertyId, propertyId));
    const publishedBySection = new Map(
      rows
        .filter((row) => row.status === 'published' && row.body.trim())
        .map((row) => [row.section, row]),
    );

    if (publishedBySection.size > 0) {
      return PROPERTY_CONTEXT_FILES.flatMap((file) => {
        const row = publishedBySection.get(file.slug);
        if (!row) return [];
        return [{
          slug: file.slug,
          title: row.title || file.title,
          filename: file.filename,
          body: row.body.trim(),
          status: row.status,
          source: 'database' as const,
          validationWarnings: row.validationWarnings,
          updatedAt: row.updatedAt,
        }];
      });
    }
  }

  const sections = await Promise.all(
    PROPERTY_CONTEXT_FILES.map(async (file) => {
      const absolutePath = path.join(process.cwd(), getPropertyContextDirectory(propertySlug), file.filename);

      try {
        const body = (await readFile(absolutePath, 'utf8')).trim();
        if (!body) return null;
        return { ...file, body, source: 'markdown' as const, validationWarnings: validateKnowledgeSection(file.slug, body) };
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') return null;
        throw error;
      }
    }),
  );

  return sections.filter(Boolean) as PropertyContextSection[];
}
