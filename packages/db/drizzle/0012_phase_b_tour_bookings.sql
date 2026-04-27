-- 0012_phase_b_tour_bookings.sql
--
-- Phase B tour booking tools:
-- - durable tour records linked to property, guest card, and conversation
-- - status and reschedule/cancel metadata for AI tool workflows
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS "public"."tour_bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id" uuid NOT NULL REFERENCES "public"."properties"("id") ON DELETE CASCADE,
  "guest_card_id" uuid REFERENCES "public"."guest_cards"("id") ON DELETE SET NULL,
  "conversation_id" uuid REFERENCES "public"."conversations"("id") ON DELETE SET NULL,
  "tour_type" text NOT NULL DEFAULT 'in_person',
  "status" text NOT NULL DEFAULT 'booked',
  "start_at" timestamptz NOT NULL,
  "end_at" timestamptz NOT NULL,
  "timezone" text NOT NULL,
  "source" text NOT NULL DEFAULT 'ai_tool',
  "rescheduled_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancellation_reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."tour_bookings" DROP CONSTRAINT IF EXISTS "tour_bookings_tour_type_check";
ALTER TABLE "public"."tour_bookings"
  ADD CONSTRAINT "tour_bookings_tour_type_check"
  CHECK ("tour_type" IN ('in_person', 'virtual', 'self_guided'));

ALTER TABLE "public"."tour_bookings" DROP CONSTRAINT IF EXISTS "tour_bookings_status_check";
ALTER TABLE "public"."tour_bookings"
  ADD CONSTRAINT "tour_bookings_status_check"
  CHECK ("status" IN ('booked', 'cancelled'));

ALTER TABLE "public"."tour_bookings" DROP CONSTRAINT IF EXISTS "tour_bookings_source_check";
ALTER TABLE "public"."tour_bookings"
  ADD CONSTRAINT "tour_bookings_source_check"
  CHECK ("source" IN ('ai_tool', 'operator'));

CREATE INDEX IF NOT EXISTS "tour_bookings_property_start_idx"
  ON "public"."tour_bookings" ("property_id", "start_at");
CREATE INDEX IF NOT EXISTS "tour_bookings_guest_card_idx"
  ON "public"."tour_bookings" ("guest_card_id");
CREATE INDEX IF NOT EXISTS "tour_bookings_conversation_idx"
  ON "public"."tour_bookings" ("conversation_id");
CREATE INDEX IF NOT EXISTS "tour_bookings_status_idx"
  ON "public"."tour_bookings" ("status");

ALTER TABLE "public"."tour_bookings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tour_bookings_select_same_org" ON "public"."tour_bookings";
CREATE POLICY "tour_bookings_select_same_org"
  ON "public"."tour_bookings"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."properties" p
      WHERE p.id = "public"."tour_bookings"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );
