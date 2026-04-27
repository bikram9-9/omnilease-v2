import { z } from 'zod';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const optionalUrl = z.string().url('Enter a valid URL').optional().or(z.literal(''));
const feeLine = z.object({
  label: z.string().min(1).max(120),
  amount: z.coerce.number().min(0),
  required: z.boolean().optional(),
  notes: z.string().max(300).optional(),
});

export const propertyInput = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  slug: z.string().max(80).regex(slugPattern, 'Use lowercase letters, numbers, and dashes').optional().or(z.literal('')),
  address: z.string().max(300).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(2).optional().or(z.literal('')),
  zip: z.string().max(10).optional().or(z.literal('')),
  timezone: z.string().default('America/New_York'),
  websiteWidgetId: z.string().max(120).optional().or(z.literal('')),
  messengerPageId: z.string().max(120).optional().or(z.literal('')),
  brandColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/, 'Use a 6-digit hex color').optional().or(z.literal('')),
  escalationEmail: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  welcomeMessage: z.string().max(500).optional().or(z.literal('')),
  aiDisclosure: z.string().max(500).optional().or(z.literal('')),
  privacyNoticeUrl: optionalUrl,
  termsUrl: optionalUrl,
  privacyDisclosureText: z.string().max(1000).optional().or(z.literal('')),
  contactFallbackLabel: z.string().max(120).optional().or(z.literal('')),
  contactFallbackUrl: z.string().max(300).optional().or(z.literal('')),
  contactFallbackText: z.string().max(1000).optional().or(z.literal('')),
  applicationUrl: optionalUrl,
  applicationFee: z.coerce.number().min(0).optional().nullable(),
  quoteDisclaimer: z.string().max(1000).optional().or(z.literal('')),
  leasingSpecials: z.string().max(1000).optional().or(z.literal('')),
  recurringFees: z.array(feeLine).default([]),
  oneTimeFees: z.array(feeLine).default([]),
  petFees: z.array(feeLine).default([]),
  parkingFees: z.array(feeLine).default([]),
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
  recurringFees: z.array(feeLine).default([]),
  oneTimeFees: z.array(feeLine).default([]),
  specials: z.string().max(1000).optional().nullable(),
  quoteDisclaimer: z.string().max(1000).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});
export type UnitTypeInput = z.infer<typeof unitTypeInput>;
