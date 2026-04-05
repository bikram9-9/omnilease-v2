import { z } from 'zod';

export const propertyInput = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  address: z.string().max(300).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(2).optional().or(z.literal('')),
  zip: z.string().max(10).optional().or(z.literal('')),
  timezone: z.string().default('America/New_York'),
});
export type PropertyInput = z.infer<typeof propertyInput>;

export const unitTypeInput = z.object({
  name: z.string().min(1).max(100),
  bedrooms: z.coerce.number().int().min(0).max(10),
  bathrooms: z.coerce.number().min(0).max(10),
  sqftMin: z.coerce.number().int().min(0).optional().nullable(),
  sqftMax: z.coerce.number().int().min(0).optional().nullable(),
  priceMin: z.coerce.number().min(0).optional().nullable(),
  priceMax: z.coerce.number().min(0).optional().nullable(),
  availableCount: z.coerce.number().int().min(0).default(0),
  deposit: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});
export type UnitTypeInput = z.infer<typeof unitTypeInput>;

export const pricingKnowledge = z.object({
  specials: z.string().max(2000).optional().nullable(),
  applicationFee: z.coerce.number().min(0).optional().nullable(),
  adminFee: z.coerce.number().min(0).optional().nullable(),
  securityDepositNote: z.string().max(500).optional().nullable(),
});

export const petsKnowledge = z.object({
  allowed: z.boolean().default(true),
  weightLimitLbs: z.coerce.number().int().min(0).optional().nullable(),
  breedRestrictions: z.string().max(1000).optional().nullable(),
  deposit: z.coerce.number().min(0).optional().nullable(),
  monthlyPetRent: z.coerce.number().min(0).optional().nullable(),
  maxPets: z.coerce.number().int().min(0).optional().nullable(),
});

export const parkingKnowledge = z.object({
  surfaceIncluded: z.boolean().default(true),
  garageAvailable: z.boolean().default(false),
  garageMonthlyCost: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const amenitiesKnowledge = z.object({
  items: z.array(z.string().min(1).max(200)).default([]),
});

export const faqEntry = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(2000),
});
export const faqsKnowledge = z.object({
  entries: z.array(faqEntry).default([]),
});

export const knowledgeSchemas = {
  pricing: pricingKnowledge,
  pets: petsKnowledge,
  parking: parkingKnowledge,
  amenities: amenitiesKnowledge,
  faqs: faqsKnowledge,
} as const;
export type EditableKnowledgeCategory = keyof typeof knowledgeSchemas;
