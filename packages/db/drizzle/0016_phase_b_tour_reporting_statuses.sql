-- 0016_phase_b_tour_reporting_statuses.sql
--
-- Phase B tour dashboard/reporting:
-- - allow operator-facing tour outcomes beyond the initial booked/cancelled tool states
-- - keep "booked" as the stored scheduled state for backward compatibility
--
-- Idempotent.

ALTER TABLE "public"."tour_bookings" DROP CONSTRAINT IF EXISTS "tour_bookings_status_check";
ALTER TABLE "public"."tour_bookings"
  ADD CONSTRAINT "tour_bookings_status_check"
  CHECK ("status" IN ('booked', 'completed', 'cancelled', 'no_show', 'converted'));
