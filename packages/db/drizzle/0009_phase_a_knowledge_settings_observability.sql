-- 0009_phase_a_knowledge_settings_observability.sql
--
-- Phase A production readiness:
-- - dashboard-managed property knowledge sections
-- - per-property assistant behavior settings
-- - guest-card consent fields for lead workflows
-- - model/prompt observability events
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS "public"."property_knowledge_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id" uuid NOT NULL REFERENCES "public"."properties"("id") ON DELETE CASCADE,
  "section" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'draft',
  "source" text NOT NULL DEFAULT 'manual',
  "import_source" text,
  "validation_warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "published_at" timestamptz,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."property_knowledge_sections" DROP CONSTRAINT IF EXISTS "property_knowledge_sections_section_check";
ALTER TABLE "public"."property_knowledge_sections"
  ADD CONSTRAINT "property_knowledge_sections_section_check"
  CHECK ("section" IN ('overview', 'amenities', 'policies', 'faqs', 'touring'));

ALTER TABLE "public"."property_knowledge_sections" DROP CONSTRAINT IF EXISTS "property_knowledge_sections_status_check";
ALTER TABLE "public"."property_knowledge_sections"
  ADD CONSTRAINT "property_knowledge_sections_status_check"
  CHECK ("status" IN ('draft', 'published'));

ALTER TABLE "public"."property_knowledge_sections" DROP CONSTRAINT IF EXISTS "property_knowledge_sections_source_check";
ALTER TABLE "public"."property_knowledge_sections"
  ADD CONSTRAINT "property_knowledge_sections_source_check"
  CHECK ("source" IN ('manual', 'import'));

CREATE INDEX IF NOT EXISTS "property_knowledge_sections_property_idx"
  ON "public"."property_knowledge_sections" ("property_id");
CREATE UNIQUE INDEX IF NOT EXISTS "property_knowledge_sections_unique_idx"
  ON "public"."property_knowledge_sections" ("property_id", "section");

CREATE TABLE IF NOT EXISTS "public"."property_assistant_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id" uuid NOT NULL REFERENCES "public"."properties"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "primary_goal" text NOT NULL DEFAULT 'book_tour',
  "tone" text NOT NULL DEFAULT 'warm_professional',
  "cta_preference" text NOT NULL DEFAULT 'ask_for_tour',
  "screening_questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "selling_points" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "escalation_triggers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."property_assistant_settings" DROP CONSTRAINT IF EXISTS "property_assistant_settings_primary_goal_check";
ALTER TABLE "public"."property_assistant_settings"
  ADD CONSTRAINT "property_assistant_settings_primary_goal_check"
  CHECK ("primary_goal" IN ('answer_questions', 'qualify_lead', 'book_tour', 'route_to_human'));

ALTER TABLE "public"."property_assistant_settings" DROP CONSTRAINT IF EXISTS "property_assistant_settings_tone_check";
ALTER TABLE "public"."property_assistant_settings"
  ADD CONSTRAINT "property_assistant_settings_tone_check"
  CHECK ("tone" IN ('warm_professional', 'concise_direct', 'luxury_concierge', 'friendly_casual'));

ALTER TABLE "public"."property_assistant_settings" DROP CONSTRAINT IF EXISTS "property_assistant_settings_cta_preference_check";
ALTER TABLE "public"."property_assistant_settings"
  ADD CONSTRAINT "property_assistant_settings_cta_preference_check"
  CHECK ("cta_preference" IN ('ask_for_tour', 'ask_for_contact', 'offer_human', 'answer_only'));

CREATE UNIQUE INDEX IF NOT EXISTS "property_assistant_settings_property_idx"
  ON "public"."property_assistant_settings" ("property_id");

ALTER TABLE "public"."guest_cards"
  ADD COLUMN IF NOT EXISTS "email_consent_status" text,
  ADD COLUMN IF NOT EXISTS "sms_consent_status" text,
  ADD COLUMN IF NOT EXISTS "marketing_consent_status" text;

CREATE TABLE IF NOT EXISTS "public"."conversation_model_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "public"."conversations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "public"."properties"("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES "public"."messages"("id") ON DELETE SET NULL,
  "status" text NOT NULL,
  "model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "assistant_settings_version" integer,
  "latency_ms" integer,
  "input_tokens" integer,
  "output_tokens" integer,
  "total_tokens" integer,
  "tool_calls" jsonb,
  "safety_outcome" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "confidence_score" numeric(3,2),
  "intent" text,
  "escalation_reason" text,
  "error_message" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."conversation_model_events" DROP CONSTRAINT IF EXISTS "conversation_model_events_status_check";
ALTER TABLE "public"."conversation_model_events"
  ADD CONSTRAINT "conversation_model_events_status_check"
  CHECK ("status" IN ('success', 'error', 'skipped'));

CREATE INDEX IF NOT EXISTS "conversation_model_events_conversation_idx"
  ON "public"."conversation_model_events" ("conversation_id");
CREATE INDEX IF NOT EXISTS "conversation_model_events_property_idx"
  ON "public"."conversation_model_events" ("property_id");
CREATE INDEX IF NOT EXISTS "conversation_model_events_created_at_idx"
  ON "public"."conversation_model_events" ("created_at");

ALTER TABLE "public"."property_knowledge_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."property_assistant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."conversation_model_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_knowledge_sections_select_same_org" ON "public"."property_knowledge_sections";
CREATE POLICY "property_knowledge_sections_select_same_org"
  ON "public"."property_knowledge_sections"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."properties" p
      WHERE p.id = "public"."property_knowledge_sections"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );

DROP POLICY IF EXISTS "property_assistant_settings_select_same_org" ON "public"."property_assistant_settings";
CREATE POLICY "property_assistant_settings_select_same_org"
  ON "public"."property_assistant_settings"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."properties" p
      WHERE p.id = "public"."property_assistant_settings"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );

DROP POLICY IF EXISTS "conversation_model_events_select_same_org" ON "public"."conversation_model_events";
CREATE POLICY "conversation_model_events_select_same_org"
  ON "public"."conversation_model_events"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."properties" p
      WHERE p.id = "public"."conversation_model_events"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );
