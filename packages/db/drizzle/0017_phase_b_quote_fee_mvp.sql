-- 0017_phase_b_quote_fee_mvp.sql
--
-- Phase B quote/application/fee disclosure MVP:
-- - property-level application link, application fee, recurring/one-time/pet/parking fee lists
-- - unit-level recurring/one-time fee overrides, specials, and disclaimer copy
--
-- This is intentionally an MVP data surface, not jurisdiction-aware fee transparency.
--
-- Idempotent.

ALTER TABLE "public"."properties"
  ADD COLUMN IF NOT EXISTS "application_url" text,
  ADD COLUMN IF NOT EXISTS "application_fee" numeric(10, 2),
  ADD COLUMN IF NOT EXISTS "quote_disclaimer" text,
  ADD COLUMN IF NOT EXISTS "leasing_specials" text,
  ADD COLUMN IF NOT EXISTS "recurring_fees" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "one_time_fees" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "pet_fees" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "parking_fees" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "public"."unit_types"
  ADD COLUMN IF NOT EXISTS "recurring_fees" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "one_time_fees" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "specials" text,
  ADD COLUMN IF NOT EXISTS "quote_disclaimer" text;
