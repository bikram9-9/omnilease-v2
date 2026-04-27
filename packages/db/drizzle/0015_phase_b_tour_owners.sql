-- Phase B agent-level calendar routing and tour ownership:
-- model property tour owners and persist assignment/fallback metadata on bookings.

create table if not exists "tour_owners" (
  "id" uuid primary key default gen_random_uuid(),
  "property_id" uuid not null references "properties"("id") on delete cascade,
  "display_name" text not null,
  "email" text,
  "phone" text,
  "is_active" integer not null default 1,
  "tour_types" jsonb not null default '["in_person"]'::jsonb,
  "calendar_provider" text not null default 'none',
  "calendar_id" text,
  "assignment_priority" integer not null default 100,
  "notes" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create index if not exists "tour_owners_property_active_idx"
  on "tour_owners" ("property_id", "is_active");

create index if not exists "tour_owners_property_priority_idx"
  on "tour_owners" ("property_id", "assignment_priority");

alter table "tour_bookings"
  add column if not exists "tour_owner_id" uuid references "tour_owners"("id") on delete set null,
  add column if not exists "owner_assignment_status" text not null default 'unassigned',
  add column if not exists "owner_assignment_reason" text,
  add column if not exists "calendar_provider" text,
  add column if not exists "calendar_id" text,
  add column if not exists "calendar_event_id" text;

create index if not exists "tour_bookings_owner_idx"
  on "tour_bookings" ("tour_owner_id");
