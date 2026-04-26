-- 0007_guest_cards.sql
--
-- Phase D CRM foundation:
-- - centralized guest cards scoped by organization
-- - cross-property guest-card links
-- - duplicate candidate review
-- - reversible merge audit snapshots
-- - guest-card activity timeline
-- - nullable conversation -> guest card link
--
-- All statements are idempotent.

CREATE TABLE IF NOT EXISTS "public"."guest_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "primary_property_id" uuid REFERENCES "public"."properties"("id") ON DELETE SET NULL,
  "owner_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active',
  "stage" text NOT NULL DEFAULT 'new',
  "source" text NOT NULL DEFAULT 'conversation',
  "first_channel" text,
  "full_name" text,
  "email" text,
  "phone" text,
  "normalized_email" text,
  "normalized_phone" text,
  "normalized_name" text,
  "move_in_date" date,
  "unit_preference" text,
  "external_ids" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "merged_into_guest_card_id" uuid REFERENCES "public"."guest_cards"("id") ON DELETE SET NULL,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."guest_cards" DROP CONSTRAINT IF EXISTS "guest_cards_status_check";
ALTER TABLE "public"."guest_cards"
  ADD CONSTRAINT "guest_cards_status_check"
  CHECK ("status" IN ('active', 'merged', 'archived'));

ALTER TABLE "public"."guest_cards" DROP CONSTRAINT IF EXISTS "guest_cards_stage_check";
ALTER TABLE "public"."guest_cards"
  ADD CONSTRAINT "guest_cards_stage_check"
  CHECK ("stage" IN ('new', 'nurturing', 'tour_scheduled', 'applied', 'leased', 'lost'));

CREATE INDEX IF NOT EXISTS "guest_cards_org_idx"
  ON "public"."guest_cards" ("org_id");
CREATE INDEX IF NOT EXISTS "guest_cards_primary_property_idx"
  ON "public"."guest_cards" ("primary_property_id");
CREATE INDEX IF NOT EXISTS "guest_cards_normalized_email_idx"
  ON "public"."guest_cards" ("org_id", "normalized_email");
CREATE INDEX IF NOT EXISTS "guest_cards_normalized_phone_idx"
  ON "public"."guest_cards" ("org_id", "normalized_phone");
CREATE INDEX IF NOT EXISTS "guest_cards_normalized_name_idx"
  ON "public"."guest_cards" ("org_id", "normalized_name");
CREATE INDEX IF NOT EXISTS "guest_cards_merged_into_idx"
  ON "public"."guest_cards" ("merged_into_guest_card_id");

CREATE TABLE IF NOT EXISTS "public"."guest_card_property_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guest_card_id" uuid NOT NULL REFERENCES "public"."guest_cards"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "public"."properties"("id") ON DELETE CASCADE,
  "source" text NOT NULL DEFAULT 'conversation',
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "guest_card_property_links_guest_card_idx"
  ON "public"."guest_card_property_links" ("guest_card_id");
CREATE INDEX IF NOT EXISTS "guest_card_property_links_property_idx"
  ON "public"."guest_card_property_links" ("property_id");
CREATE UNIQUE INDEX IF NOT EXISTS "guest_card_property_links_unique_idx"
  ON "public"."guest_card_property_links" ("guest_card_id", "property_id");

CREATE TABLE IF NOT EXISTS "public"."guest_card_duplicate_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "primary_guest_card_id" uuid NOT NULL REFERENCES "public"."guest_cards"("id") ON DELETE CASCADE,
  "duplicate_guest_card_id" uuid NOT NULL REFERENCES "public"."guest_cards"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'open',
  "confidence" numeric(3,2) NOT NULL DEFAULT 0.50,
  "match_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz,
  "resolved_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL
);

ALTER TABLE "public"."guest_card_duplicate_candidates" DROP CONSTRAINT IF EXISTS "guest_card_duplicate_candidates_status_check";
ALTER TABLE "public"."guest_card_duplicate_candidates"
  ADD CONSTRAINT "guest_card_duplicate_candidates_status_check"
  CHECK ("status" IN ('open', 'merged', 'dismissed'));

CREATE INDEX IF NOT EXISTS "guest_card_duplicate_candidates_org_idx"
  ON "public"."guest_card_duplicate_candidates" ("org_id");
CREATE INDEX IF NOT EXISTS "guest_card_duplicate_candidates_primary_idx"
  ON "public"."guest_card_duplicate_candidates" ("primary_guest_card_id");
CREATE INDEX IF NOT EXISTS "guest_card_duplicate_candidates_duplicate_idx"
  ON "public"."guest_card_duplicate_candidates" ("duplicate_guest_card_id");
CREATE UNIQUE INDEX IF NOT EXISTS "guest_card_duplicate_candidates_pair_idx"
  ON "public"."guest_card_duplicate_candidates" ("primary_guest_card_id", "duplicate_guest_card_id");

CREATE TABLE IF NOT EXISTS "public"."guest_card_merge_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "source_guest_card_id" uuid NOT NULL,
  "target_guest_card_id" uuid NOT NULL REFERENCES "public"."guest_cards"("id") ON DELETE CASCADE,
  "duplicate_candidate_id" uuid REFERENCES "public"."guest_card_duplicate_candidates"("id") ON DELETE SET NULL,
  "merged_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "source_snapshot" jsonb NOT NULL,
  "target_snapshot" jsonb NOT NULL,
  "reversible" boolean NOT NULL DEFAULT true,
  "merged_at" timestamptz NOT NULL DEFAULT now(),
  "reverted_at" timestamptz,
  "reverted_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "guest_card_merge_audits_org_idx"
  ON "public"."guest_card_merge_audits" ("org_id");
CREATE INDEX IF NOT EXISTS "guest_card_merge_audits_source_idx"
  ON "public"."guest_card_merge_audits" ("source_guest_card_id");
CREATE INDEX IF NOT EXISTS "guest_card_merge_audits_target_idx"
  ON "public"."guest_card_merge_audits" ("target_guest_card_id");

CREATE TABLE IF NOT EXISTS "public"."guest_card_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guest_card_id" uuid NOT NULL REFERENCES "public"."guest_cards"("id") ON DELETE CASCADE,
  "property_id" uuid REFERENCES "public"."properties"("id") ON DELETE SET NULL,
  "conversation_id" uuid,
  "event_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."guest_card_activities" DROP CONSTRAINT IF EXISTS "guest_card_activities_event_type_check";
ALTER TABLE "public"."guest_card_activities"
  ADD CONSTRAINT "guest_card_activities_event_type_check"
  CHECK ("event_type" IN ('conversation', 'tour', 'quote', 'application', 'task', 'note', 'merge', 'integration'));

CREATE INDEX IF NOT EXISTS "guest_card_activities_guest_card_idx"
  ON "public"."guest_card_activities" ("guest_card_id");
CREATE INDEX IF NOT EXISTS "guest_card_activities_property_idx"
  ON "public"."guest_card_activities" ("property_id");
CREATE INDEX IF NOT EXISTS "guest_card_activities_conversation_idx"
  ON "public"."guest_card_activities" ("conversation_id");
CREATE INDEX IF NOT EXISTS "guest_card_activities_occurred_at_idx"
  ON "public"."guest_card_activities" ("occurred_at");

ALTER TABLE "public"."conversations"
  ADD COLUMN IF NOT EXISTS "guest_card_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'conversations'
      AND constraint_name = 'conversations_guest_card_id_fk'
  ) THEN
    ALTER TABLE "public"."conversations"
      ADD CONSTRAINT "conversations_guest_card_id_fk"
      FOREIGN KEY ("guest_card_id")
      REFERENCES "public"."guest_cards"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "conversations_guest_card_idx"
  ON "public"."conversations" ("guest_card_id");

ALTER TABLE "public"."guest_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guest_card_property_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guest_card_duplicate_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guest_card_merge_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guest_card_activities" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_cards_select_same_org" ON "public"."guest_cards";
CREATE POLICY "guest_cards_select_same_org"
  ON "public"."guest_cards"
  FOR SELECT
  TO authenticated
  USING ("org_id" = "public"."current_org_id"());

DROP POLICY IF EXISTS "guest_card_property_links_select_same_org" ON "public"."guest_card_property_links";
CREATE POLICY "guest_card_property_links_select_same_org"
  ON "public"."guest_card_property_links"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."guest_cards" gc
      WHERE gc.id = "public"."guest_card_property_links"."guest_card_id"
        AND gc.org_id = "public"."current_org_id"()
    )
  );

DROP POLICY IF EXISTS "guest_card_duplicate_candidates_select_same_org" ON "public"."guest_card_duplicate_candidates";
CREATE POLICY "guest_card_duplicate_candidates_select_same_org"
  ON "public"."guest_card_duplicate_candidates"
  FOR SELECT
  TO authenticated
  USING ("org_id" = "public"."current_org_id"());

DROP POLICY IF EXISTS "guest_card_merge_audits_select_same_org" ON "public"."guest_card_merge_audits";
CREATE POLICY "guest_card_merge_audits_select_same_org"
  ON "public"."guest_card_merge_audits"
  FOR SELECT
  TO authenticated
  USING ("org_id" = "public"."current_org_id"());

DROP POLICY IF EXISTS "guest_card_activities_select_same_org" ON "public"."guest_card_activities";
CREATE POLICY "guest_card_activities_select_same_org"
  ON "public"."guest_card_activities"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."guest_cards" gc
      WHERE gc.id = "public"."guest_card_activities"."guest_card_id"
        AND gc.org_id = "public"."current_org_id"()
    )
  );
