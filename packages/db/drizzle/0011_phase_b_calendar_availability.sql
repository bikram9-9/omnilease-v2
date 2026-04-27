-- 0011_phase_b_calendar_availability.sql
--
-- Phase B calendar availability provider configuration:
-- - property-level Google Calendar MVP configuration
-- - operator-visible provider status/error fields
--
-- Idempotent.

ALTER TABLE "public"."property_tour_settings"
  ADD COLUMN IF NOT EXISTS "calendar_provider" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "calendar_id" text,
  ADD COLUMN IF NOT EXISTS "calendar_auth_status" text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS "calendar_last_error" text,
  ADD COLUMN IF NOT EXISTS "calendar_last_checked_at" timestamptz;

ALTER TABLE "public"."property_tour_settings" DROP CONSTRAINT IF EXISTS "property_tour_settings_calendar_provider_check";
ALTER TABLE "public"."property_tour_settings"
  ADD CONSTRAINT "property_tour_settings_calendar_provider_check"
  CHECK ("calendar_provider" IN ('none', 'google_calendar'));

ALTER TABLE "public"."property_tour_settings" DROP CONSTRAINT IF EXISTS "property_tour_settings_calendar_auth_status_check";
ALTER TABLE "public"."property_tour_settings"
  ADD CONSTRAINT "property_tour_settings_calendar_auth_status_check"
  CHECK ("calendar_auth_status" IN ('not_configured', 'configured', 'error'));
