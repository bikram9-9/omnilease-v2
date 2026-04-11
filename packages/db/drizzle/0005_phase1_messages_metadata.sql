-- 0005_phase1_messages_metadata.sql
--
-- Adds public.messages.metadata (jsonb) so the conversation engine can
-- persist audit info that doesn't warrant its own column — currently just
-- { safety_flag: true } when applySafetyFilter() rewrote or redacted the
-- model output. Plan 1b's SMS route handler will also write
-- { intent: '...' } on inbound prospect rows.
--
-- Idempotent.

ALTER TABLE "public"."messages"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;
