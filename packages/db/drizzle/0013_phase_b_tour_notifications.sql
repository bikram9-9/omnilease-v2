-- 0013_phase_b_tour_notifications.sql
--
-- Phase B tour confirmations/reminders/follow-ups:
-- - durable notification jobs for prospect/team confirmations
-- - reminder and post-tour follow-up scheduling
-- - retry/failure/suppression state visible to dashboard surfaces
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS "public"."tour_notification_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tour_booking_id" uuid NOT NULL REFERENCES "public"."tour_bookings"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "public"."properties"("id") ON DELETE CASCADE,
  "guest_card_id" uuid REFERENCES "public"."guest_cards"("id") ON DELETE SET NULL,
  "conversation_id" uuid REFERENCES "public"."conversations"("id") ON DELETE SET NULL,
  "job_type" text NOT NULL,
  "recipient_kind" text NOT NULL,
  "channel" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "run_at" timestamptz NOT NULL,
  "next_attempt_at" timestamptz NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "sent_at" timestamptz,
  "last_error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."tour_notification_jobs" DROP CONSTRAINT IF EXISTS "tour_notification_jobs_job_type_check";
ALTER TABLE "public"."tour_notification_jobs"
  ADD CONSTRAINT "tour_notification_jobs_job_type_check"
  CHECK ("job_type" IN ('tour_confirmation', 'tour_reminder', 'post_tour_follow_up'));

ALTER TABLE "public"."tour_notification_jobs" DROP CONSTRAINT IF EXISTS "tour_notification_jobs_recipient_kind_check";
ALTER TABLE "public"."tour_notification_jobs"
  ADD CONSTRAINT "tour_notification_jobs_recipient_kind_check"
  CHECK ("recipient_kind" IN ('prospect', 'leasing_team', 'dashboard_task'));

ALTER TABLE "public"."tour_notification_jobs" DROP CONSTRAINT IF EXISTS "tour_notification_jobs_channel_check";
ALTER TABLE "public"."tour_notification_jobs"
  ADD CONSTRAINT "tour_notification_jobs_channel_check"
  CHECK ("channel" IN ('email', 'dashboard_task'));

ALTER TABLE "public"."tour_notification_jobs" DROP CONSTRAINT IF EXISTS "tour_notification_jobs_status_check";
ALTER TABLE "public"."tour_notification_jobs"
  ADD CONSTRAINT "tour_notification_jobs_status_check"
  CHECK ("status" IN ('pending', 'sent', 'suppressed', 'failed'));

CREATE INDEX IF NOT EXISTS "tour_notification_jobs_booking_idx"
  ON "public"."tour_notification_jobs" ("tour_booking_id");
CREATE INDEX IF NOT EXISTS "tour_notification_jobs_due_idx"
  ON "public"."tour_notification_jobs" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "tour_notification_jobs_property_run_idx"
  ON "public"."tour_notification_jobs" ("property_id", "run_at");
CREATE UNIQUE INDEX IF NOT EXISTS "tour_notification_jobs_unique_booking_job_idx"
  ON "public"."tour_notification_jobs" ("tour_booking_id", "job_type", "recipient_kind");

ALTER TABLE "public"."tour_notification_jobs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tour_notification_jobs_select_same_org" ON "public"."tour_notification_jobs";
CREATE POLICY "tour_notification_jobs_select_same_org"
  ON "public"."tour_notification_jobs"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."properties" p
      WHERE p.id = "public"."tour_notification_jobs"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );
