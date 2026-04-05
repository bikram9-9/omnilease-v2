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
