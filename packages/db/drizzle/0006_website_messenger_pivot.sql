-- 0006_website_messenger_pivot.sql
--
-- Reorients the schema around website + Messenger channels:
-- - property context moves from property_knowledge rows to Markdown files
-- - SMS/Twilio/TCPA tables are removed from the active model
-- - properties get a slug plus website/messenger identifiers

ALTER TABLE "public"."properties"
  ADD COLUMN IF NOT EXISTS "slug" text,
  ADD COLUMN IF NOT EXISTS "website_widget_id" text,
  ADD COLUMN IF NOT EXISTS "messenger_page_id" text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'properties'
      AND column_name = 'webchat_widget_id'
  ) THEN
    UPDATE "public"."properties"
    SET "website_widget_id" = COALESCE("website_widget_id", "webchat_widget_id");
  END IF;
END $$;

UPDATE "public"."properties"
SET "slug" = COALESCE(
  NULLIF("slug", ''),
  LOWER(REGEXP_REPLACE(COALESCE("name", 'property'), '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || LEFT("id"::text, 8)
);

ALTER TABLE "public"."properties"
  ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "properties_slug_idx"
  ON "public"."properties" ("slug");

CREATE UNIQUE INDEX IF NOT EXISTS "properties_website_widget_id_idx"
  ON "public"."properties" ("website_widget_id");

CREATE UNIQUE INDEX IF NOT EXISTS "properties_messenger_page_id_idx"
  ON "public"."properties" ("messenger_page_id");

DROP INDEX IF EXISTS "properties_twilio_phone_idx";

ALTER TABLE "public"."properties"
  DROP COLUMN IF EXISTS "twilio_phone",
  DROP COLUMN IF EXISTS "webchat_widget_id";

DROP TABLE IF EXISTS "public"."property_knowledge" CASCADE;
DROP TABLE IF EXISTS "public"."sms_opt_outs" CASCADE;
DROP TABLE IF EXISTS "public"."consent_records" CASCADE;
