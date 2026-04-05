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
