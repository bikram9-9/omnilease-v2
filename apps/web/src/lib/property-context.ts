import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type PropertyContextSection = {
  slug: string;
  title: string;
  filename: string;
  body: string;
};

const PROPERTY_CONTEXT_FILES = [
  { slug: 'overview', title: 'Overview', filename: 'overview.md' },
  { slug: 'amenities', title: 'Amenities', filename: 'amenities.md' },
  { slug: 'policies', title: 'Policies', filename: 'policies.md' },
  { slug: 'faqs', title: 'FAQs', filename: 'faqs.md' },
  { slug: 'touring', title: 'Touring', filename: 'touring.md' },
] as const;

export function getPropertyContextDirectory(propertySlug: string): string {
  return path.join('content', 'properties', propertySlug);
}

export async function loadPropertyContext(propertySlug: string): Promise<PropertyContextSection[]> {
  const sections = await Promise.all(
    PROPERTY_CONTEXT_FILES.map(async (file) => {
      const absolutePath = path.join(process.cwd(), getPropertyContextDirectory(propertySlug), file.filename);

      try {
        const body = (await readFile(absolutePath, 'utf8')).trim();
        if (!body) return null;
        return { ...file, body };
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') return null;
        throw error;
      }
    }),
  );

  return sections.filter(Boolean) as PropertyContextSection[];
}
