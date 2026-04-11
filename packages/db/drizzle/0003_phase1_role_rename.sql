-- 0003_phase1_role_rename.sql
--
-- (a) Migrate users.role from the legacy field-worker enum
--     (worker | property_manager | supervisor_manager | admin)
--     to the AI-answering-service enum (admin | manager | agent).
--     Remap:
--       worker             -> agent
--       property_manager   -> manager
--       supervisor_manager -> manager
--       admin              -> admin
--
-- (b) Drop the public.user_context view — mobile-only, no longer needed.
--
-- (c) Add widget/escalation columns to public.properties.
--
-- All statements are idempotent.

-- ---------------------------------------------------------------------------
-- (a) Role rename
-- ---------------------------------------------------------------------------

-- Drop the check constraint first so the UPDATE doesn't fight it.
ALTER TABLE "public"."users" DROP CONSTRAINT IF EXISTS "users_role_check";

UPDATE "public"."users"
SET "role" = CASE "role"
  WHEN 'worker'             THEN 'agent'
  WHEN 'property_manager'   THEN 'manager'
  WHEN 'supervisor_manager' THEN 'manager'
  WHEN 'admin'              THEN 'admin'
  ELSE 'agent'   -- safety fallback for any unexpected legacy value
END;

-- Default for new rows is the least-privileged role.
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'agent';

ALTER TABLE "public"."users"
  ADD CONSTRAINT "users_role_check"
  CHECK ("role" IN ('admin', 'manager', 'agent'));

-- ---------------------------------------------------------------------------
-- (b) Drop user_context view (was mobile-only)
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS "public"."user_context";

-- ---------------------------------------------------------------------------
-- (c) properties columns for widget + escalation email
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."properties"
  ADD COLUMN IF NOT EXISTS "brand_color"      text,
  ADD COLUMN IF NOT EXISTS "escalation_email" text,
  ADD COLUMN IF NOT EXISTS "welcome_message"  text;
