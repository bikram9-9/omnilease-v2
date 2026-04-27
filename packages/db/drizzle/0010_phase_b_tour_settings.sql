-- 0010_phase_b_tour_settings.sql
--
-- Phase B tour conversion foundation:
-- - per-property tour type, hours, blackout, buffer, capacity, and scheduling-window settings
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS "public"."property_tour_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id" uuid NOT NULL REFERENCES "public"."properties"("id") ON DELETE CASCADE,
  "enabled_tour_types" jsonb NOT NULL DEFAULT '["in_person"]'::jsonb,
  "default_duration_minutes" integer NOT NULL DEFAULT 30,
  "buffer_minutes" integer NOT NULL DEFAULT 15,
  "capacity_per_slot" integer NOT NULL DEFAULT 1,
  "scheduling_window_days" integer NOT NULL DEFAULT 14,
  "tour_hours" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "blackout_dates" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."property_tour_settings" DROP CONSTRAINT IF EXISTS "property_tour_settings_duration_check";
ALTER TABLE "public"."property_tour_settings"
  ADD CONSTRAINT "property_tour_settings_duration_check"
  CHECK ("default_duration_minutes" BETWEEN 15 AND 240);

ALTER TABLE "public"."property_tour_settings" DROP CONSTRAINT IF EXISTS "property_tour_settings_buffer_check";
ALTER TABLE "public"."property_tour_settings"
  ADD CONSTRAINT "property_tour_settings_buffer_check"
  CHECK ("buffer_minutes" BETWEEN 0 AND 240);

ALTER TABLE "public"."property_tour_settings" DROP CONSTRAINT IF EXISTS "property_tour_settings_capacity_check";
ALTER TABLE "public"."property_tour_settings"
  ADD CONSTRAINT "property_tour_settings_capacity_check"
  CHECK ("capacity_per_slot" BETWEEN 1 AND 25);

ALTER TABLE "public"."property_tour_settings" DROP CONSTRAINT IF EXISTS "property_tour_settings_window_check";
ALTER TABLE "public"."property_tour_settings"
  ADD CONSTRAINT "property_tour_settings_window_check"
  CHECK ("scheduling_window_days" BETWEEN 1 AND 365);

CREATE UNIQUE INDEX IF NOT EXISTS "property_tour_settings_property_idx"
  ON "public"."property_tour_settings" ("property_id");

ALTER TABLE "public"."property_tour_settings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_tour_settings_select_same_org" ON "public"."property_tour_settings";
CREATE POLICY "property_tour_settings_select_same_org"
  ON "public"."property_tour_settings"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."properties" p
      WHERE p.id = "public"."property_tour_settings"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );
