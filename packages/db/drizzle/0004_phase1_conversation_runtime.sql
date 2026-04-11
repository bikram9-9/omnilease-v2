-- 0004_phase1_conversation_runtime.sql
--
-- (a) Add messages.author_type (ai | human_agent | prospect).
-- (b) Create sms_opt_outs and consent_records (TCPA primitives).
-- (c) Enable RLS on conversations, messages, escalations, sms_opt_outs,
--     consent_records. Policies scope via properties.org_id = current_org_id().
-- (d) Add conversations, messages, and escalations to the supabase_realtime
--     publication so the dashboard can subscribe.
--
-- All statements are idempotent.

-- ---------------------------------------------------------------------------
-- (a) messages.author_type
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."messages"
  ADD COLUMN IF NOT EXISTS "author_type" text
    NOT NULL DEFAULT 'ai';

UPDATE "public"."messages"
SET "author_type" = CASE "role"
  WHEN 'user'      THEN 'prospect'
  WHEN 'assistant' THEN 'ai'
  WHEN 'system'    THEN 'ai'
  ELSE 'ai'
END;

ALTER TABLE "public"."messages" DROP CONSTRAINT IF EXISTS "messages_author_type_check";
ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_author_type_check"
  CHECK ("author_type" IN ('ai', 'human_agent', 'prospect'));

-- ---------------------------------------------------------------------------
-- (b) TCPA tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."sms_opt_outs" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"  uuid NOT NULL REFERENCES "public"."properties"("id") ON DELETE CASCADE,
  "phone"        text NOT NULL,                      -- E.164
  "keyword"      text,
  "opted_out_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sms_opt_outs_property_phone_idx"
  ON "public"."sms_opt_outs" ("property_id", "phone");

CREATE TABLE IF NOT EXISTS "public"."consent_records" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id"  uuid NOT NULL REFERENCES "public"."properties"("id") ON DELETE CASCADE,
  "phone"        text NOT NULL,
  "source"       text NOT NULL,           -- 'first_contact' | 'manual' | 'widget'
  "consent_text" text NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "consent_records_property_phone_idx"
  ON "public"."consent_records" ("property_id", "phone");

-- ---------------------------------------------------------------------------
-- (c) RLS on new + existing conversation tables
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."conversations"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."escalations"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sms_opt_outs"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."consent_records"  ENABLE ROW LEVEL SECURITY;

-- conversations: scoped by property.org_id
DROP POLICY IF EXISTS "conversations_select_same_org" ON "public"."conversations";
CREATE POLICY "conversations_select_same_org"
  ON "public"."conversations"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "public"."properties" p
      WHERE p.id = "public"."conversations"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );

-- messages: scoped by the parent conversation's property.org_id
DROP POLICY IF EXISTS "messages_select_same_org" ON "public"."messages";
CREATE POLICY "messages_select_same_org"
  ON "public"."messages"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "public"."conversations" c
      JOIN "public"."properties" p ON p.id = c.property_id
      WHERE c.id = "public"."messages"."conversation_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );

-- escalations: scoped via conversation -> property
DROP POLICY IF EXISTS "escalations_select_same_org" ON "public"."escalations";
CREATE POLICY "escalations_select_same_org"
  ON "public"."escalations"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "public"."conversations" c
      JOIN "public"."properties" p ON p.id = c.property_id
      WHERE c.id = "public"."escalations"."conversation_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );

-- sms_opt_outs + consent_records: scoped by property.org_id
DROP POLICY IF EXISTS "sms_opt_outs_select_same_org" ON "public"."sms_opt_outs";
CREATE POLICY "sms_opt_outs_select_same_org"
  ON "public"."sms_opt_outs"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "public"."properties" p
      WHERE p.id = "public"."sms_opt_outs"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );

DROP POLICY IF EXISTS "consent_records_select_same_org" ON "public"."consent_records";
CREATE POLICY "consent_records_select_same_org"
  ON "public"."consent_records"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "public"."properties" p
      WHERE p.id = "public"."consent_records"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );

-- Writes from the Next.js app use the service-role key, which bypasses RLS.
-- No INSERT/UPDATE/DELETE policies are added here — intentional, per spec §7.3.

-- ---------------------------------------------------------------------------
-- (d) Realtime publication
-- ---------------------------------------------------------------------------

-- The supabase_realtime publication already exists on Supabase projects.
-- Add our tables to it so the dashboard can subscribe to INSERTs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."messages";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'escalations'
  ) THEN
    ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."escalations";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."conversations";
  END IF;
END $$;
