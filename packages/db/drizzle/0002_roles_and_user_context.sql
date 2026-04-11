-- 0002_roles_and_user_context.sql
--
-- (a) Updates the role model on public.users to the new operations enum:
--     worker | property_manager | supervisor_manager | admin
--     Backfill: agent->worker, manager->property_manager, admin->admin.
--     Adds a CHECK constraint and changes the default to 'worker'.
--
-- (b) Creates a public.user_context view that joins users + organizations.
--     Mobile clients select from this view (instead of running a Drizzle join)
--     so we have one source of truth for "who is the current user, what org,
--     what role." Web continues to use the Drizzle join in apps/web/src/lib/auth.ts.
--
-- (c) Enables row-level security on users, organizations, properties, unit_types
--     and adds policies that scope by the auth.uid()'s org_id. This is the
--     security model for the Expo mobile app, which talks to Supabase directly.
--
-- All statements are idempotent so re-runs and partial failures are safe.

-- ---------------------------------------------------------------------------
-- (a) Role enum update
-- ---------------------------------------------------------------------------

-- Backfill existing rows to the new role names. Use CASE so we only touch
-- known legacy values; anything already on a new value is left alone.
-- 'super_admin' is mapped to 'admin' because the new role model collapses
-- the two — admin already has full org-wide access.
UPDATE "public"."users"
SET "role" = CASE "role"
  WHEN 'agent'       THEN 'worker'
  WHEN 'manager'     THEN 'property_manager'
  WHEN 'admin'       THEN 'admin'
  WHEN 'super_admin' THEN 'admin'
  ELSE "role"
END
WHERE "role" IN ('agent', 'manager', 'admin', 'super_admin');

-- Drop the old default ('agent') before adding the CHECK so the constraint
-- doesn't reject the column default during evaluation.
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'worker';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE "public"."users"
      ADD CONSTRAINT "users_role_check"
      CHECK ("role" IN ('worker', 'property_manager', 'supervisor_manager', 'admin'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- (b) user_context view
-- ---------------------------------------------------------------------------
--
-- Exposes exactly the columns the mobile client needs to bootstrap a session,
-- and nothing else. Selects are RLS-protected via the underlying users table
-- policy ("user can read their own row").

CREATE OR REPLACE VIEW "public"."user_context" AS
SELECT
  u.id              AS user_id,
  u.auth_user_id    AS auth_user_id,
  u.email           AS email,
  u.name            AS name,
  u.role            AS role,
  o.id              AS org_id,
  o.slug            AS org_slug,
  o.name            AS org_name
FROM "public"."users" u
JOIN "public"."organizations" o ON o.id = u.org_id;

-- Views inherit RLS from their base tables in Postgres 15+, but we set
-- security_invoker = on explicitly to make the contract obvious and to
-- ensure the policies on `users` apply when mobile clients read the view.
ALTER VIEW "public"."user_context" SET (security_invoker = on);

GRANT SELECT ON "public"."user_context" TO authenticated;

-- ---------------------------------------------------------------------------
-- (c) Row-level security
-- ---------------------------------------------------------------------------
--
-- Strategy: a user can only read rows that belong to their own org. Admins
-- and supervisor_managers can read across the entire org (which is already
-- the case under this policy because RLS is org-scoped, not property-scoped).
-- Per-property scoping (e.g. workers seeing only their assigned properties)
-- is enforced at the application layer until we add a property_assignments
-- table.

ALTER TABLE "public"."users"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."properties"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."unit_types"    ENABLE ROW LEVEL SECURITY;

-- Helper: get the current auth user's org_id. Marked STABLE so the planner
-- can cache it within a single statement, and SECURITY DEFINER so it can
-- read public.users without recursing into the RLS policy we're about to
-- create on that same table.
CREATE OR REPLACE FUNCTION "public"."current_org_id"()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM "public"."users" WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION "public"."current_org_id"() TO authenticated;

-- public.users: a user can read their own row, plus any other users in the
-- same org (so the app can show "assigned to: <name>" lookups).
DROP POLICY IF EXISTS "users_select_self_or_same_org" ON "public"."users";
CREATE POLICY "users_select_self_or_same_org"
  ON "public"."users"
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR org_id = "public"."current_org_id"()
  );

-- public.organizations: a user can read only their own org row.
DROP POLICY IF EXISTS "organizations_select_own" ON "public"."organizations";
CREATE POLICY "organizations_select_own"
  ON "public"."organizations"
  FOR SELECT
  TO authenticated
  USING (id = "public"."current_org_id"());

-- public.properties: a user can read all properties in their own org.
DROP POLICY IF EXISTS "properties_select_same_org" ON "public"."properties";
CREATE POLICY "properties_select_same_org"
  ON "public"."properties"
  FOR SELECT
  TO authenticated
  USING (org_id = "public"."current_org_id"());

-- public.unit_types: a user can read unit_types belonging to properties in
-- their own org. (unit_types has no direct org_id, so we join through properties.)
DROP POLICY IF EXISTS "unit_types_select_same_org" ON "public"."unit_types";
CREATE POLICY "unit_types_select_same_org"
  ON "public"."unit_types"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "public"."properties" p
      WHERE p.id = "public"."unit_types"."property_id"
        AND p.org_id = "public"."current_org_id"()
    )
  );

-- NOTE: write policies (INSERT/UPDATE/DELETE) are intentionally NOT added
-- here. All mutations from mobile go through Next.js route handlers using
-- the service role key for now. We can add per-role write policies in a
-- follow-up migration once the mobile mutation surfaces are designed.
