-- Add FK from public.users.auth_user_id to Supabase's built-in auth.users(id).
-- Drizzle can't introspect the `auth` schema so we author this by hand.
-- Idempotent via DO block so re-runs are safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_user_id_fk'
  ) THEN
    ALTER TABLE "public"."users"
      ADD CONSTRAINT "users_auth_user_id_fk"
      FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;
