-- 0014_phase_b_widget_disclosure.sql
--
-- Phase B widget trust configuration:
-- - AI disclosure shown before first chat
-- - privacy/terms disclosure links or copy
-- - human/property contact fallback surfaced in the widget
--
-- Idempotent.

ALTER TABLE "public"."properties"
  ADD COLUMN IF NOT EXISTS "ai_disclosure" text,
  ADD COLUMN IF NOT EXISTS "privacy_notice_url" text,
  ADD COLUMN IF NOT EXISTS "terms_url" text,
  ADD COLUMN IF NOT EXISTS "privacy_disclosure_text" text,
  ADD COLUMN IF NOT EXISTS "contact_fallback_label" text,
  ADD COLUMN IF NOT EXISTS "contact_fallback_url" text,
  ADD COLUMN IF NOT EXISTS "contact_fallback_text" text;
