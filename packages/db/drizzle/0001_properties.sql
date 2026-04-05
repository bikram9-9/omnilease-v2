CREATE TABLE IF NOT EXISTS "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"office_hours" jsonb,
	"twilio_phone" text,
	"webchat_widget_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_webchat_widget_id_unique" UNIQUE("webchat_widget_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"category" text NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bedrooms" integer NOT NULL,
	"bathrooms" numeric(3, 1) NOT NULL,
	"sqft_min" integer,
	"sqft_max" integer,
	"price_min" numeric(10, 2),
	"price_max" numeric(10, 2),
	"available_count" integer DEFAULT 0 NOT NULL,
	"deposit" numeric(10, 2),
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_knowledge" ADD CONSTRAINT "property_knowledge_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_types" ADD CONSTRAINT "unit_types_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_org_idx" ON "properties" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "properties_twilio_phone_idx" ON "properties" USING btree ("twilio_phone");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "property_knowledge_property_category_idx" ON "property_knowledge" USING btree ("property_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_types_property_idx" ON "unit_types" USING btree ("property_id");