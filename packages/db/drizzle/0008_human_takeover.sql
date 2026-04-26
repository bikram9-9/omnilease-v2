-- 0008_human_takeover.sql
--
-- Adds explicit conversation automation state so operators can pause AI
-- auto-replies while a human agent owns the thread.
--
-- Idempotent.

ALTER TABLE "public"."conversations"
  ADD COLUMN IF NOT EXISTS "automation_state" text NOT NULL DEFAULT 'ai_active';

ALTER TABLE "public"."conversations" DROP CONSTRAINT IF EXISTS "conversations_automation_state_check";
ALTER TABLE "public"."conversations"
  ADD CONSTRAINT "conversations_automation_state_check"
  CHECK ("automation_state" IN ('ai_active', 'human_takeover'));

CREATE INDEX IF NOT EXISTS "conversations_automation_state_idx"
  ON "public"."conversations" ("automation_state");
