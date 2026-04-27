-- 0018_phase_b_readiness_gate.sql
--
-- Phase B go-live readiness:
-- - explicit launch mode before production exposure
-- - recorded launch validation script results per property
--
-- Idempotent.

ALTER TABLE "public"."properties"
  ADD COLUMN IF NOT EXISTS "launch_mode" text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "readiness_test_results" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "public"."properties" DROP CONSTRAINT IF EXISTS "properties_launch_mode_check";
ALTER TABLE "public"."properties"
  ADD CONSTRAINT "properties_launch_mode_check"
  CHECK ("launch_mode" IN ('draft', 'monitor', 'allowlist', 'production'));
