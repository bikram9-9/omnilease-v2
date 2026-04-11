# Phase 1a — Foundation + Conversation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the leftover mobile app and role model, migrate the database for Phase 1, and build the full `lib/conversation/*` engine with Resend-backed escalation — ending with engine integration tests passing against real Supabase and a mocked AI Gateway.

**Architecture:** Single Next.js 16 + Supabase project. No new deploy targets. Conversation engine is a set of pure-ish TypeScript modules that take `(inboundMessage, conversation, property)` and produce an assistant turn — no knowledge of HTTP, Twilio, or the widget. This plan produces the library; plans 1b and 1c add the transports (SMS/widget) and dashboard UI.

**Tech Stack:** Next.js 16, TypeScript, Supabase Postgres + Realtime + RLS, Drizzle ORM, AI SDK v6 (`ai` package, AI Gateway via `"anthropic/claude-sonnet-4.6"` model string), Resend for email, Vitest + Supabase local (`supabase start`) for integration tests.

**Source spec:** `docs/superpowers/specs/2026-04-11-phase1-ai-answering-service-design.md`

**Non-goals for this plan:** No Twilio SDK usage, no `/api/webhooks/*` routes, no widget, no dashboard pages. Those come in plans 1b and 1c.

---

## File Structure

```
omnilease-service-v2/
├── .claude/.../memory/project_architecture.md     # REWRITTEN
├── apps/
│   ├── mobile/                                     # DELETED
│   └── web/
│       ├── package.json                            # +ai, +resend
│       ├── .env.example                            # +RESEND_*, +AI_GATEWAY_*
│       └── src/
│           ├── lib/
│           │   ├── auth.ts                         # Role type updated
│           │   ├── email/
│           │   │   └── resend.ts                   # NEW — sendEscalationEmail
│           │   └── conversation/
│           │       ├── engine.ts                   # NEW — processConversation
│           │       ├── system-prompt.ts            # NEW — pure builder
│           │       ├── history.ts                  # NEW — loadHistory
│           │       ├── intent.ts                   # NEW — keyword classifier
│           │       ├── tools.ts                    # NEW — 3 AI SDK tools
│           │       ├── safety.ts                   # NEW — regex + PII + confidence
│           │       └── escalate.ts                 # NEW — escalation row + email
│           └── lib/conversation/__tests__/
│               ├── system-prompt.test.ts
│               ├── intent.test.ts
│               ├── safety.test.ts
│               └── engine.int.test.ts              # real Supabase, mocked gateway
└── packages/
    ├── db/
    │   ├── drizzle/
    │   │   ├── 0003_phase1_role_rename.sql         # NEW
    │   │   └── 0004_phase1_conversation_runtime.sql # NEW
    │   └── src/schema/
    │       ├── tenancy.ts                           # Role type swap
    │       ├── properties.ts                        # +brand_color etc.
    │       ├── conversations.ts                     # +authorType
    │       ├── tcpa.ts                              # NEW
    │       └── index.ts                             # barrel: export tcpa
    └── shared/src/
        └── roles.ts                                 # REWRITTEN
```

### Responsibility boundaries

- `lib/conversation/engine.ts` is the only entry point for producing an assistant turn. Both Plan 1b's SMS webhook and widget routes will import from here.
- `lib/conversation/system-prompt.ts` is a pure function (no DB, no network) — trivial to snapshot-test.
- `lib/email/resend.ts` is the only place that imports the `resend` SDK. The engine imports `sendEscalationEmail` from here; tests mock at that boundary.
- `lib/conversation/*` does NOT import from `@/app/...` — no coupling to routes or server actions.
- `packages/db/src/schema/tcpa.ts` owns `sms_opt_outs` and `consent_records`. The engine doesn't write to these (Plan 1b's Twilio verify path does) but the schema lives here so Plan 1b can land cleanly.

---

## Tasks

### Task 1: Delete the mobile app and update auto-memory

**Files:**
- Delete: `apps/mobile/` (entire directory)
- Modify: `/Users/bikramsingh/.claude/projects/-Users-bikramsingh-repos-omni-omnilease-service-v2/memory/project_architecture.md`
- Modify: `pnpm-workspace.yaml` (if it lists `apps/mobile` explicitly)

- [ ] **Step 1: Verify no other workspace package depends on the mobile app**

Run:
```bash
grep -R "apps/mobile\|@omnilease/mobile" --include="*.json" --include="*.yaml" --include="*.ts" .
```
Expected: matches only inside `apps/mobile/` itself. If anything else matches, stop and investigate.

- [ ] **Step 2: Delete the mobile app directory**

Run:
```bash
rm -rf apps/mobile
```

- [ ] **Step 3: Check `pnpm-workspace.yaml`**

Run:
```bash
cat pnpm-workspace.yaml
```
If it lists `apps/*` globbed, no change needed. If it explicitly lists `apps/mobile`, remove that line so it reads:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 4: Verify the workspace still resolves**

Run:
```bash
pnpm install
```
Expected: completes without error, no `apps/mobile` entry in the resulting lockfile changes.

- [ ] **Step 5: Rewrite the auto-memory file for the new product direction**

Overwrite `/Users/bikramsingh/.claude/projects/-Users-bikramsingh-repos-omni-omnilease-service-v2/memory/project_architecture.md` with:

```markdown
---
name: Omnilease architecture (Next.js web app for AI answering service)
description: Omnilease is a Next.js 16 + Supabase Postgres SaaS — an AI leasing/answering service for multifamily properties. Single-app monorepo on Vercel.
type: project
---

Omnilease is an AI answering / leasing assistant for multifamily properties.
The product is a single Next.js 16 web app (`apps/web`) deployed to Vercel,
backed by Supabase Postgres (+ Realtime + RLS) and driven by Claude via the
Vercel AI Gateway.

- `apps/web` — Next.js 16 App Router. Dashboard + API routes + embeddable widget.
- `packages/db` — Drizzle schema + `postgres-js` driver. Server-only (never imported from the browser).
- `packages/shared` — pure TypeScript: zod validators, role helpers. Safe to import anywhere.
- `packages/supabase` — Supabase client factory for web (`@supabase/ssr` cookies) and queries.

**Roles:** `admin | manager | agent` (DB CHECK constraint on `public.users.role`).
- `admin` — full access across the org
- `manager` — can edit properties + reply to conversations
- `agent` — can reply to conversations

**Source spec:** `new-omnilease-spec.md` (April 2026, v1.0 MVP) is the product source of truth.

**History:** Earlier iterations of this repo targeted a field-worker/manager product with both Next.js and Expo clients. That direction was abandoned on 2026-04-11. The mobile app, field-worker role, and `user_context` view were removed. Any mention of "worker" or Expo in old docs is historical.
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete mobile app and rewrite project memory for AI answering service pivot"
```

---

### Task 2: Write migration 0003 — role rename and property column additions

**Files:**
- Create: `packages/db/drizzle/0003_phase1_role_rename.sql`

- [ ] **Step 1: Create the migration file**

Create `packages/db/drizzle/0003_phase1_role_rename.sql`:

```sql
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
```

- [ ] **Step 2: Apply the migration to local Supabase**

Run:
```bash
cd packages/db
pnpm exec drizzle-kit push
```
Expected: drizzle-kit offers to apply statements; confirm with `y`. Or apply the SQL directly via `supabase db reset` if you prefer a clean slate on a scratch branch.

- [ ] **Step 3: Verify the schema changes in Postgres**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='properties' AND column_name IN ('brand_color','escalation_email','welcome_message');"
psql "$DATABASE_URL" -c "SELECT conname FROM pg_constraint WHERE conname='users_role_check';"
psql "$DATABASE_URL" -c "SELECT * FROM pg_views WHERE viewname='user_context';"
```
Expected: three property columns listed, `users_role_check` present, no `user_context` row.

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/0003_phase1_role_rename.sql
git commit -m "feat(db): migrate role enum to admin|manager|agent and drop user_context"
```

---

### Task 3: Write migration 0004 — conversation runtime (TCPA, author_type, RLS, Realtime)

**Files:**
- Create: `packages/db/drizzle/0004_phase1_conversation_runtime.sql`

- [ ] **Step 1: Create the migration file**

Create `packages/db/drizzle/0004_phase1_conversation_runtime.sql`:

```sql
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
```

- [ ] **Step 2: Apply to local Supabase**

```bash
cd packages/db
pnpm exec drizzle-kit push
```
Confirm with `y` when prompted.

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "\d public.sms_opt_outs"
psql "$DATABASE_URL" -c "\d public.consent_records"
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='messages' AND column_name='author_type';"
psql "$DATABASE_URL" -c "SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename;"
```
Expected: both tables present; `author_type` listed; publication includes `conversations`, `escalations`, `messages` (plus whatever was there before).

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/0004_phase1_conversation_runtime.sql
git commit -m "feat(db): tcpa tables, author_type, RLS, and realtime publication for phase 1"
```

---

### Task 4: Update Drizzle TypeScript schema to match migrations

**Files:**
- Modify: `packages/db/src/schema/tenancy.ts`
- Modify: `packages/db/src/schema/properties.ts`
- Modify: `packages/db/src/schema/conversations.ts`
- Create: `packages/db/src/schema/tcpa.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Update `tenancy.ts` Role type**

Replace the `Role` type line in `packages/db/src/schema/tenancy.ts`:

```ts
export type Role = 'admin' | 'manager' | 'agent';
```

And update the `role` column default in the `users` table definition:

```ts
role: text('role').$type<Role>().notNull().default('agent'),
```

Leave everything else in that file unchanged.

- [ ] **Step 2: Add property columns to `properties.ts`**

In `packages/db/src/schema/properties.ts`, add inside the `properties` table definition (alongside `twilioPhone` and `webchatWidgetId`):

```ts
brandColor: text('brand_color'),
escalationEmail: text('escalation_email'),
welcomeMessage: text('welcome_message'),
```

- [ ] **Step 3: Add `authorType` to `conversations.ts`**

In `packages/db/src/schema/conversations.ts`, add a `MessageAuthorType` type and a new column on the `messages` table:

After the existing `MessageRole` type export:

```ts
export type MessageAuthorType = 'ai' | 'human_agent' | 'prospect';
```

Inside the `messages` table definition, after `role`:

```ts
authorType: text('author_type').$type<MessageAuthorType>().notNull().default('ai'),
```

- [ ] **Step 4: Create `tcpa.ts`**

Create `packages/db/src/schema/tcpa.ts`:

```ts
import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { properties } from './properties';

export type OptOutKeyword = 'STOP' | 'UNSUBSCRIBE' | 'CANCEL' | 'END' | 'QUIT';
export type ConsentSource = 'first_contact' | 'manual' | 'widget';

export const smsOptOuts = pgTable(
  'sms_opt_outs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    keyword: text('keyword').$type<OptOutKeyword>(),
    optedOutAt: timestamp('opted_out_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyPhoneIdx: uniqueIndex('sms_opt_outs_property_phone_idx').on(t.propertyId, t.phone),
  }),
);

export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    source: text('source').$type<ConsentSource>().notNull(),
    consentText: text('consent_text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyPhoneIdx: uniqueIndex('consent_records_property_phone_idx').on(t.propertyId, t.phone),
  }),
);

export type SmsOptOut = typeof smsOptOuts.$inferSelect;
export type NewSmsOptOut = typeof smsOptOuts.$inferInsert;
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type NewConsentRecord = typeof consentRecords.$inferInsert;
```

- [ ] **Step 5: Export from the schema barrel**

Modify `packages/db/src/schema/index.ts` to add:

```ts
export * from './tcpa';
```

- [ ] **Step 6: Typecheck**

Run:
```bash
pnpm --filter @omnilease/db typecheck
pnpm --filter @omnilease/web typecheck
```
Expected: both pass. If `apps/web` fails because of the new `Role` type ('admin' | 'manager' | 'agent'), that's Task 6's problem — proceed to commit this task and fix it there.

Note: the `auth.ts` file currently has `role: string` (not typed `Role`), so it should still compile. If you see an unrelated type error from the new `authorType` column, add a default in the insert site in Task 7.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/
git commit -m "feat(db): drizzle schema updates for phase 1 conversation runtime"
```

---

### Task 5: Rewrite `packages/shared/src/roles.ts`

**Files:**
- Modify: `packages/shared/src/roles.ts`

- [ ] **Step 1: Replace the entire file content**

Overwrite `packages/shared/src/roles.ts` with:

```ts
/**
 * Role model for the omnilease AI answering service.
 *
 * The DB enforces this set via a CHECK constraint in
 * packages/db/drizzle/0003_phase1_role_rename.sql. Keep in sync.
 */

export const ROLES = ['admin', 'manager', 'agent'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Only admins can invite users or change roles. */
export function canManageOrg(role: Role): boolean {
  return role === 'admin';
}

/** Admins and managers can edit property data (knowledge base, unit types, etc.). */
export function canEditProperty(role: Role): boolean {
  return role === 'admin' || role === 'manager';
}

/** All three roles can take over a conversation and reply as a human. */
export function canReplyToConversation(role: Role): boolean {
  return role === 'admin' || role === 'manager' || role === 'agent';
}

/** Human-friendly label for UI. */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'manager':
      return 'Property Manager';
    case 'agent':
      return 'Leasing Agent';
  }
}
```

- [ ] **Step 2: Typecheck the shared package**

```bash
pnpm --filter @omnilease/shared typecheck
```
Expected: passes.

- [ ] **Step 3: Typecheck the rest of the workspace**

```bash
pnpm -r typecheck
```
Expected: may fail in `apps/web` if any page imports `canManageProperties` / `canViewAllProperties` / `defaultHomeRoute` / the `worker` enum value. Note the failing files for Task 6 and proceed.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/roles.ts
git commit -m "refactor(shared): replace role helpers with admin|manager|agent model"
```

---

### Task 6: Fix `apps/web` callers of the old role helpers

**Files:**
- Modify: `apps/web/src/lib/auth.ts`
- Modify: any file flagged by `pnpm --filter @omnilease/web typecheck` in Task 5 Step 3

- [ ] **Step 1: Type `role` properly in `AuthContext`**

In `apps/web/src/lib/auth.ts`, replace the import and the type:

```ts
import { redirect } from 'next/navigation';
import { db, eq, organizations, users } from '@omnilease/db';
import { createClient } from '@/lib/supabase/server';
import type { Role } from '@omnilease/shared';

export type AuthContext = {
  userId: string;
  authUserId: string;
  email: string;
  orgId: string;
  orgSlug: string;
  role: Role;
};
```

Leave `requireOrg()` unchanged except for the returned `role` field, which is already sourced from the DB column (a `text` that matches the new check constraint values at runtime — TypeScript needs only the annotation swap).

At the return statement, cast:

```ts
return {
  userId: row.userId,
  authUserId: row.authUserId,
  email: row.email,
  orgId: row.orgId,
  orgSlug: row.orgSlug,
  role: row.role as Role,
};
```

- [ ] **Step 2: Find and fix other callers**

Run:
```bash
grep -R "canManageProperties\|canViewAllProperties\|canManageUsers\|defaultHomeRoute\|'worker'\|'property_manager'\|'supervisor_manager'" apps/web/src || true
```

For each match:
- `canManageProperties(role)` → `canEditProperty(role)`
- `canViewAllProperties(role)` → `canEditProperty(role)` (admin + manager — visibility is already org-scoped via `requireOrg`)
- `canManageUsers(role)` → `canManageOrg(role)`
- `defaultHomeRoute(role)` → hardcode `/dashboard` (no per-role landing pages in Phase 1)
- Enum string literals → update to new values, or rely on type inference

- [ ] **Step 3: Typecheck the web app**

```bash
pnpm --filter @omnilease/web typecheck
```
Expected: passes. If it doesn't, the previous step missed a call site — re-run the grep with the reported file.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/
git commit -m "fix(web): update role helper call sites to new role model"
```

---

### Task 7: Install `ai` and `resend` dependencies and add env vars

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Install the runtime dependencies**

Run from the repo root:
```bash
pnpm --filter @omnilease/web add ai@^6 resend@^4
```

- [ ] **Step 2: Verify they were added to `apps/web/package.json`**

Check that `dependencies` in `apps/web/package.json` now includes:

```json
"ai": "^6.0.0",
"resend": "^4.0.0"
```

(Exact patch versions will vary — the caret ranges above are what matters.)

- [ ] **Step 3: Add env var placeholders to `.env.example`**

Append to `apps/web/.env.example`:

```bash
# ---- AI Gateway (OIDC-authenticated Claude via model strings) ----
# No env var to set. Run `vercel link` → enable AI Gateway in the Vercel
# dashboard → `vercel env pull`. This provisions VERCEL_OIDC_TOKEN automatically
# and rotates it on each deploy. Zero manual key management. OIDC is the only
# supported auth method for this project.

# ---- Resend (escalation email) ----
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Omnilease <alerts@example.com>
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck
```
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/.env.example pnpm-lock.yaml
git commit -m "chore(web): add ai sdk v6 and resend, document env vars"
```

---

### Task 8: Write `lib/email/resend.ts`

**Files:**
- Create: `apps/web/src/lib/email/resend.ts`
- Create: `apps/web/src/lib/email/__tests__/resend.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `apps/web/src/lib/email/__tests__/resend.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock the Resend module at the module boundary — the whole point of this
// thin wrapper is to make tests swap out the SDK without touching the rest
// of the codebase.
const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

describe('sendEscalationEmail', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'msg_fake' }, error: null });
    process.env.RESEND_API_KEY = 're_fake';
    process.env.RESEND_FROM_EMAIL = 'Omnilease <alerts@example.com>';
  });

  it('sends the escalation email with conversation context in the body', async () => {
    const { sendEscalationEmail } = await import('../resend');
    await sendEscalationEmail({
      to: 'manager@example.com',
      propertyName: 'Sunset Ridge',
      prospectLabel: '+15551234567',
      reason: 'Prospect asked to speak with a human',
      conversationUrl: 'https://app.example.com/conversations/abc-123',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toBe('manager@example.com');
    expect(arg.from).toBe('Omnilease <alerts@example.com>');
    expect(arg.subject).toContain('Sunset Ridge');
    expect(arg.text).toContain('Prospect asked to speak with a human');
    expect(arg.text).toContain('https://app.example.com/conversations/abc-123');
    expect(arg.text).toContain('+15551234567');
  });

  it('throws if RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    vi.resetModules();
    const { sendEscalationEmail } = await import('../resend');
    await expect(
      sendEscalationEmail({
        to: 'x@example.com',
        propertyName: 'P',
        prospectLabel: 'p',
        reason: 'r',
        conversationUrl: 'u',
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('propagates Resend errors', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'rate_limited' } });
    const { sendEscalationEmail } = await import('../resend');
    await expect(
      sendEscalationEmail({
        to: 'x@example.com',
        propertyName: 'P',
        prospectLabel: 'p',
        reason: 'r',
        conversationUrl: 'u',
      }),
    ).rejects.toThrow(/rate_limited/);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

```bash
pnpm --filter @omnilease/web test src/lib/email/__tests__/resend.test.ts
```
Expected: FAIL — `Cannot find module '../resend'`.

- [ ] **Step 3: Implement `lib/email/resend.ts`**

Create `apps/web/src/lib/email/resend.ts`:

```ts
import { Resend } from 'resend';

export type SendEscalationEmailInput = {
  to: string;
  propertyName: string;
  prospectLabel: string;   // phone, email, or name
  reason: string;
  conversationUrl: string;
};

let cached: Resend | null = null;

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!cached) cached = new Resend(key);
  return cached;
}

export async function sendEscalationEmail(input: SendEscalationEmailInput): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');

  const subject = `[${input.propertyName}] New escalation — ${input.reason}`;
  const text = [
    `A conversation at ${input.propertyName} was escalated to a human.`,
    '',
    `Prospect: ${input.prospectLabel}`,
    `Reason:   ${input.reason}`,
    '',
    `Open the conversation: ${input.conversationUrl}`,
    '',
    '— Omnilease',
  ].join('\n');

  const client = getClient();
  const { error } = await client.emails.send({
    from,
    to: input.to,
    subject,
    text,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter @omnilease/web test src/lib/email/__tests__/resend.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/email/
git commit -m "feat(web): add Resend escalation email helper"
```

---

### Task 9: Write `lib/conversation/intent.ts` (keyword classifier)

**Files:**
- Create: `apps/web/src/lib/conversation/intent.ts`
- Create: `apps/web/src/lib/conversation/__tests__/intent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conversation/__tests__/intent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyIntent, INTENTS, type Intent } from '../intent';

describe('classifyIntent', () => {
  const cases: Array<[string, Intent]> = [
    ['How much is rent?', 'pricing'],
    ['whats the price of a 1 bedroom', 'pricing'],
    ['Do you allow dogs? I have a 60lb golden', 'pets'],
    ['pet policy?', 'pets'],
    ['Is there parking?', 'parking'],
    ['Do you have a gym', 'amenities'],
    ['can I tour the apartment this weekend', 'tour'],
    ['schedule a visit', 'tour'],
    ['how do i apply', 'application'],
    ['what do you have available in june', 'availability'],
    ['this is unacceptable, I want to speak to a manager', 'complaint'],
    ['can someone call me back', 'other'],
  ];

  for (const [input, expected] of cases) {
    it(`classifies "${input}" as ${expected}`, () => {
      expect(classifyIntent(input)).toBe(expected);
    });
  }

  it('exports the intent enum for analytics', () => {
    expect(INTENTS).toContain('pricing');
    expect(INTENTS).toContain('other');
  });

  it('is case-insensitive', () => {
    expect(classifyIntent('PRICE?')).toBe('pricing');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm --filter @omnilease/web test src/lib/conversation/__tests__/intent.test.ts
```
Expected: FAIL — `Cannot find module '../intent'`.

- [ ] **Step 3: Implement `intent.ts`**

Create `apps/web/src/lib/conversation/intent.ts`:

```ts
export const INTENTS = [
  'pricing',
  'pets',
  'parking',
  'amenities',
  'tour',
  'application',
  'availability',
  'complaint',
  'other',
] as const;

export type Intent = (typeof INTENTS)[number];

// Keyword tables ordered by specificity. First match wins.
// Patterns use word-ish boundaries (\b) so "price" matches "price?" but not "sprites".
const PATTERNS: Array<[Intent, RegExp]> = [
  ['complaint',    /\b(unacceptable|complain|complaint|manager|supervisor|awful|terrible|horrible)\b/i],
  ['tour',         /\b(tour|visit|show\s+me|come\s+see|showing|walk\s*through|open\s+house|schedul(e|ing))\b/i],
  ['application',  /\b(appl(y|ication|ying)|qualif(y|ication)|approve|approval|credit\s*check)\b/i],
  ['pricing',      /\b(price|pricing|rent|cost|monthly|deposit|fee|specials?|promo|discount)\b/i],
  ['pets',         /\b(pet|pets|dog|dogs|cat|cats|animal|breed|weight\s*limit)\b/i],
  ['parking',      /\b(park|parking|garage|carport|spot|ev\s*charg|bike\s*rack)\b/i],
  ['amenities',    /\b(gym|pool|hot\s*tub|lounge|clubhouse|laundry|dishwasher|wifi|amenity|amenities|playground)\b/i],
  ['availability', /\b(available|availability|open\s+units?|vacan(t|cy)|move[-\s]?in|when\s+can\s+i)\b/i],
];

export function classifyIntent(text: string): Intent {
  for (const [intent, re] of PATTERNS) {
    if (re.test(text)) return intent;
  }
  return 'other';
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
pnpm --filter @omnilease/web test src/lib/conversation/__tests__/intent.test.ts
```
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/conversation/intent.ts apps/web/src/lib/conversation/__tests__/intent.test.ts
git commit -m "feat(web): keyword-based intent classifier for analytics"
```

---

### Task 10: Write `lib/conversation/safety.ts`

**Files:**
- Create: `apps/web/src/lib/conversation/safety.ts`
- Create: `apps/web/src/lib/conversation/__tests__/safety.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conversation/__tests__/safety.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applySafetyFilter } from '../safety';

describe('applySafetyFilter', () => {
  it('passes through a clean response untouched', () => {
    const out = applySafetyFilter('We have a 1BR available for $1,800/mo. Want to schedule a tour?');
    expect(out.text).toBe('We have a 1BR available for $1,800/mo. Want to schedule a tour?');
    expect(out.flagged).toBe(false);
    expect(out.autoEscalate).toBe(false);
  });

  it('flags fair-housing-loaded phrases and swaps in a neutral fallback', () => {
    const out = applySafetyFilter("It's a family-friendly community with great schools.");
    expect(out.flagged).toBe(true);
    expect(out.text).not.toContain('family-friendly');
    expect(out.text.length).toBeGreaterThan(0);
  });

  it('strips SSN-like sequences', () => {
    const out = applySafetyFilter('Your application ID is 123-45-6789.');
    expect(out.text).not.toMatch(/\d{3}-\d{2}-\d{4}/);
    expect(out.flagged).toBe(true);
  });

  it('strips credit-card-like sequences', () => {
    const out = applySafetyFilter('Card 4111 1111 1111 1111 processed.');
    expect(out.text).not.toMatch(/\b4111\b/);
    expect(out.flagged).toBe(true);
  });

  it('auto-escalates when the response is unusually hedged', () => {
    const out = applySafetyFilter("I'm not sure. I think maybe it might be $1500? I don't really know.");
    expect(out.autoEscalate).toBe(true);
    expect(out.confidence).toBeLessThan(0.7);
  });

  it('does not auto-escalate for a confident answer', () => {
    const out = applySafetyFilter('The deposit is $500 and the application fee is $50.');
    expect(out.autoEscalate).toBe(false);
    expect(out.confidence).toBeGreaterThanOrEqual(0.7);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm --filter @omnilease/web test src/lib/conversation/__tests__/safety.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `safety.ts`**

Create `apps/web/src/lib/conversation/safety.ts`:

```ts
export type SafetyResult = {
  text: string;
  flagged: boolean;       // true if any filter rewrote or stripped content
  autoEscalate: boolean;  // true if confidence too low
  confidence: number;     // 0..1
};

// Phrases that could be read as Fair Housing violations or steering.
// Case-insensitive, whole-phrase match. Replacement is a generic fallback.
const FAIR_HOUSING_PHRASES: RegExp[] = [
  /\bfamily[-\s]friendly\b/i,
  /\bquiet\s+community\b/i,
  /\bpeaceful\s+neighborhood\b/i,
  /\bgood\s+schools?\b/i,
  /\bsafe\s+area\b/i,
  /\bnice\s+families\b/i,
];

// PII patterns.
const SSN_RE          = /\b\d{3}-\d{2}-\d{4}\b/g;
const CC_RE           = /\b(?:\d[ -]?){13,19}\b/g;

// Hedging markers — more hits == lower confidence.
const HEDGE_MARKERS: RegExp[] = [
  /\bi'?m not sure\b/i,
  /\bi think\b/i,
  /\bmaybe\b/i,
  /\bmight be\b/i,
  /\bi don'?t (really )?know\b/i,
  /\bnot certain\b/i,
  /\bprobably\b/i,
];

const NEUTRAL_FALLBACK = "We have details on that — want me to send specifics over, or connect you with the leasing team?";

export function applySafetyFilter(input: string): SafetyResult {
  let text = input;
  let flagged = false;

  // 1) Fair housing phrases — replace the whole output with the neutral fallback
  //    so we never surface loaded language.
  for (const re of FAIR_HOUSING_PHRASES) {
    if (re.test(text)) {
      text = NEUTRAL_FALLBACK;
      flagged = true;
      break;
    }
  }

  // 2) PII scrub — redact in place.
  if (SSN_RE.test(text)) {
    text = text.replace(SSN_RE, '[redacted]');
    flagged = true;
  }
  SSN_RE.lastIndex = 0;

  if (CC_RE.test(text)) {
    text = text.replace(CC_RE, '[redacted]');
    flagged = true;
  }
  CC_RE.lastIndex = 0;

  // 3) Confidence via hedge count.
  let hedges = 0;
  for (const re of HEDGE_MARKERS) {
    if (re.test(text)) hedges += 1;
  }
  // 0 hedges = 0.95 confidence; each hedge drops 0.15.
  const confidence = Math.max(0, Math.min(1, 0.95 - hedges * 0.15));
  const autoEscalate = confidence < 0.7;

  return { text, flagged, autoEscalate, confidence };
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
pnpm --filter @omnilease/web test src/lib/conversation/__tests__/safety.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/conversation/safety.ts apps/web/src/lib/conversation/__tests__/safety.test.ts
git commit -m "feat(web): safety filter — fair housing + PII + confidence"
```

---

### Task 11: Write `lib/conversation/history.ts`

**Files:**
- Create: `apps/web/src/lib/conversation/history.ts`

- [ ] **Step 1: Create the module**

Create `apps/web/src/lib/conversation/history.ts`:

```ts
import { db, eq, desc } from '@omnilease/db';
import { messages } from '@omnilease/db';

export type HistoryTurn = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * Load the last `limit` turns of a conversation in chronological order,
 * shaped for AI SDK `convertToModelMessages`. System messages are filtered
 * out because the system prompt is rebuilt per-call.
 */
export async function loadHistory(
  conversationId: string,
  limit = 20,
): Promise<HistoryTurn[]> {
  const rows = await db
    .select({
      role: messages.role,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows
    .reverse()
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck
```
Expected: passes. (Integration coverage for this function comes in Task 15's `engine.int.test.ts` — not worth a standalone integration test for a 15-line query.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/conversation/history.ts
git commit -m "feat(web): loadHistory — fetch last 20 turns for LLM context"
```

---

### Task 12: Write `lib/conversation/system-prompt.ts`

**Files:**
- Create: `apps/web/src/lib/conversation/system-prompt.ts`
- Create: `apps/web/src/lib/conversation/__tests__/system-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conversation/__tests__/system-prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, type SystemPromptInput } from '../system-prompt';

const input: SystemPromptInput = {
  property: {
    name: 'Sunset Ridge',
    address: '123 Main St',
    city: 'Pensacola',
    state: 'FL',
    timezone: 'America/Chicago',
    officeHours: { mon: { open: '09:00', close: '18:00' } },
    welcomeMessage: null,
  },
  unitTypes: [
    { name: '1BR/1BA',  bedrooms: 1, bathrooms: '1',   sqftMin: 650, sqftMax: 720, priceMin: '1500', priceMax: '1700', availableCount: 3, deposit: '500',  description: null, isActive: true },
    { name: '2BR/2BA',  bedrooms: 2, bathrooms: '2',   sqftMin: 900, sqftMax: 1000, priceMin: '2000', priceMax: '2300', availableCount: 0, deposit: '750',  description: null, isActive: true },
    { name: 'OLD STUDIO', bedrooms: 0, bathrooms: '1', sqftMin: 400, sqftMax: 450, priceMin: '1200', priceMax: '1300', availableCount: 1, deposit: '500',  description: null, isActive: false },
  ],
  knowledge: [
    { category: 'pets',    content: { dogsAllowed: true,  maxWeightLbs: 75, petRent: 35, petDeposit: 300 } },
    { category: 'parking', content: { spots: 'one per unit', garageFee: 75 } },
    { category: 'faqs',    content: { items: [{ q: 'Are utilities included?', a: 'Water and trash, yes. Electric is separate.' }] } },
  ],
};

describe('buildSystemPrompt', () => {
  it('includes property name, address, and timezone', () => {
    const out = buildSystemPrompt(input);
    expect(out).toContain('Sunset Ridge');
    expect(out).toContain('123 Main St');
    expect(out).toContain('America/Chicago');
  });

  it('includes fair-housing guardrails verbatim', () => {
    const out = buildSystemPrompt(input);
    expect(out.toLowerCase()).toContain('fair housing');
    expect(out).toContain('family-friendly'); // must be mentioned as a NOT phrase
    expect(out).toContain('quiet community');
  });

  it('lists active unit types with beds/baths/price/availability', () => {
    const out = buildSystemPrompt(input);
    expect(out).toContain('1BR/1BA');
    expect(out).toContain('2BR/2BA');
    expect(out).toMatch(/\$1,?500/);
    expect(out).toMatch(/3 available/);
  });

  it('excludes inactive unit types', () => {
    const out = buildSystemPrompt(input);
    expect(out).not.toContain('OLD STUDIO');
  });

  it('renders each knowledge category', () => {
    const out = buildSystemPrompt(input);
    expect(out.toLowerCase()).toContain('pets');
    expect(out).toContain('75'); // dog weight
    expect(out).toContain('Are utilities included?');
  });

  it('instructs the model to keep SMS replies short and include a soft CTA', () => {
    const out = buildSystemPrompt(input);
    expect(out.toLowerCase()).toMatch(/2[-\s]3 sentences/);
    expect(out.toLowerCase()).toContain('soft cta');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
pnpm --filter @omnilease/web test src/lib/conversation/__tests__/system-prompt.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `system-prompt.ts`**

Create `apps/web/src/lib/conversation/system-prompt.ts`:

```ts
import type { OfficeHours } from '@omnilease/db';

export type SystemPromptProperty = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  timezone: string;
  officeHours: OfficeHours | null;
  welcomeMessage: string | null;
};

export type SystemPromptUnitType = {
  name: string;
  bedrooms: number;
  bathrooms: string;  // drizzle numeric comes back as string
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: string | null;
  priceMax: string | null;
  availableCount: number;
  deposit: string | null;
  description: string | null;
  isActive: boolean;
};

export type SystemPromptKnowledge = {
  category: string;
  content: unknown;
};

export type SystemPromptInput = {
  property: SystemPromptProperty;
  unitTypes: SystemPromptUnitType[];
  knowledge: SystemPromptKnowledge[];
};

function money(n: string | null): string {
  if (!n) return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return n;
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function sqftRange(u: SystemPromptUnitType): string {
  if (u.sqftMin && u.sqftMax) return `${u.sqftMin}–${u.sqftMax} sqft`;
  if (u.sqftMin) return `${u.sqftMin}+ sqft`;
  return '';
}

function unitTypeLine(u: SystemPromptUnitType): string {
  const range = sqftRange(u);
  const price = `${money(u.priceMin)}–${money(u.priceMax)}/mo`;
  const parts = [
    `${u.name} (${u.bedrooms} bed / ${u.bathrooms} bath)`,
    range,
    price,
    `${u.availableCount} available`,
  ].filter(Boolean);
  return `- ${parts.join(', ')}`;
}

function renderKnowledge(k: SystemPromptKnowledge): string {
  // Render each category as "<Category>: <JSON>" — the model handles JSON fine
  // and this keeps the builder truly pure (no per-category formatting logic).
  return `### ${k.category}\n${JSON.stringify(k.content, null, 2)}`;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const { property, unitTypes, knowledge } = input;
  const activeUnits = unitTypes.filter((u) => u.isActive);

  const sections: string[] = [];

  sections.push(
    [
      'You are a leasing assistant for a multifamily apartment community.',
      'Your job is to answer prospect questions about the property, collect their',
      'contact info when appropriate, and help them schedule a tour.',
      '',
      'Tone: warm, concise, professional. Sound like a helpful human leasing agent,',
      'not a chatbot. Never use generic AI-assistant phrasing like "As an AI…".',
    ].join('\n'),
  );

  sections.push(
    [
      'FAIR HOUSING RULES (critical — violation is a legal liability):',
      '- Never reference race, color, national origin, religion, sex, familial status, or disability.',
      '- Never steer prospects toward or away from units or areas based on personal characteristics.',
      '- Never use phrases like "family-friendly", "quiet community", "safe area", or "good schools".',
      '- Treat every prospect with the same information and the same tone.',
      '- If a question touches protected class topics, call escalate_to_human.',
    ].join('\n'),
  );

  const addr = [property.address, property.city, property.state].filter(Boolean).join(', ');
  sections.push(
    [
      `PROPERTY`,
      `Name: ${property.name}`,
      addr ? `Address: ${addr}` : '',
      `Timezone: ${property.timezone}`,
      property.officeHours ? `Office hours: ${JSON.stringify(property.officeHours)}` : '',
      property.welcomeMessage ? `Greeting: ${property.welcomeMessage}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  if (activeUnits.length > 0) {
    sections.push(
      ['UNIT TYPES', ...activeUnits.map(unitTypeLine)].join('\n'),
    );
  }

  if (knowledge.length > 0) {
    sections.push(
      ['KNOWLEDGE BASE', ...knowledge.map(renderKnowledge)].join('\n\n'),
    );
  }

  sections.push(
    [
      'AVAILABLE ACTIONS',
      '- Answer questions using only the context above. Never invent pricing, availability, or policies not in the knowledge base.',
      '- Call collect_prospect_info when you learn the prospect\'s name, email, phone, move-in date, or unit preference.',
      '- Call check_availability to narrow unit options by bedrooms or max price.',
      '- Call escalate_to_human when the prospect asks for a human, on any fair housing / legal / complaint / pricing negotiation topic, or if you don\'t have enough context to answer confidently.',
    ].join('\n'),
  );

  sections.push(
    [
      'RESPONSE FORMAT',
      '- Keep replies to 2-3 sentences for SMS. Webchat can be slightly longer but stay concise.',
      '- Reference the property by name naturally — not every message.',
      '- End with a soft CTA (ask a follow-up, suggest a tour, offer to send more details).',
      '- Never repeat the prospect\'s question back to them.',
    ].join('\n'),
  );

  return sections.join('\n\n');
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
pnpm --filter @omnilease/web test src/lib/conversation/__tests__/system-prompt.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/conversation/system-prompt.ts apps/web/src/lib/conversation/__tests__/system-prompt.test.ts
git commit -m "feat(web): pure system prompt builder from property + units + knowledge"
```

---

### Task 13: Write `lib/conversation/tools.ts`

**Files:**
- Create: `apps/web/src/lib/conversation/tools.ts`

- [ ] **Step 1: Create the module**

Create `apps/web/src/lib/conversation/tools.ts`:

```ts
import { z } from 'zod';
import { tool } from 'ai';
import { db, eq, and, gte, lte, sql } from '@omnilease/db';
import { conversations, unitTypes } from '@omnilease/db';

export type ConversationToolContext = {
  conversationId: string;
  propertyId: string;
};

/**
 * Build the tool set for a single conversation turn. Tools close over the
 * conversation context so they can write to the right rows without taking
 * the id on every call.
 *
 * Returned tools are AI SDK v6 tools — they use `inputSchema` (not v5's
 * `parameters`).
 */
export function buildConversationTools(ctx: ConversationToolContext) {
  return {
    collect_prospect_info: tool({
      description:
        "Save what you've learned about the prospect. Call this whenever you pick up the prospect's name, email, phone, desired move-in date, or unit preference — once per piece of info is fine.",
      inputSchema: z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        moveInDate: z.string().optional(), // ISO yyyy-mm-dd
        unitPreference: z.string().optional(),
      }),
      execute: async (args) => {
        const update: Record<string, unknown> = {};
        if (args.name) update.prospectName = args.name;
        if (args.email) update.prospectEmail = args.email;
        if (args.phone) update.prospectPhone = args.phone;
        if (args.moveInDate) update.moveInDate = args.moveInDate;
        if (args.unitPreference) update.unitPreference = args.unitPreference;
        if (Object.keys(update).length === 0) return { ok: true, saved: 0 };
        await db.update(conversations).set(update).where(eq(conversations.id, ctx.conversationId));
        return { ok: true, saved: Object.keys(update).length };
      },
    }),

    check_availability: tool({
      description:
        "Return currently available unit types at this property, optionally filtered by bedrooms or max monthly price. Use the result to give the prospect a specific answer.",
      inputSchema: z.object({
        bedrooms: z.number().int().min(0).max(10).optional(),
        maxPrice: z.number().int().positive().optional(),
      }),
      execute: async (args) => {
        const conditions = [
          eq(unitTypes.propertyId, ctx.propertyId),
          eq(unitTypes.isActive, true),
          sql`${unitTypes.availableCount} > 0`,
        ];
        if (typeof args.bedrooms === 'number') conditions.push(eq(unitTypes.bedrooms, args.bedrooms));
        if (typeof args.maxPrice === 'number') conditions.push(lte(unitTypes.priceMin, String(args.maxPrice)));

        const rows = await db
          .select({
            name: unitTypes.name,
            bedrooms: unitTypes.bedrooms,
            bathrooms: unitTypes.bathrooms,
            priceMin: unitTypes.priceMin,
            priceMax: unitTypes.priceMax,
            availableCount: unitTypes.availableCount,
          })
          .from(unitTypes)
          .where(and(...conditions));

        return { units: rows };
      },
    }),

    escalate_to_human: tool({
      description:
        "Escalate the conversation to a human leasing agent. Call this when the prospect asks for a human, on fair housing / legal / complaint / pricing negotiation topics, or if you don't have enough info to answer confidently.",
      inputSchema: z.object({
        reason: z.string(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      }),
      execute: async (args) => {
        // The actual escalation side-effect (writing the escalations row,
        // sending the Resend email) is handled in escalate.ts, invoked by
        // engine.ts after the LLM call finishes — not inside the tool — so
        // this execute just records intent.
        return {
          escalated: true,
          reason: args.reason,
          priority: args.priority,
          acknowledgement:
            "Got it — one of our team members will follow up with you shortly. Anything else I can help with in the meantime?",
        };
      },
    }),
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck
```
Expected: passes. If `lte(unitTypes.priceMin, String(...))` type-errors, drizzle's `lte` on a numeric column accepts string — should be fine. If not, cast via `sql` template.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/conversation/tools.ts
git commit -m "feat(web): conversation tools — collect_info, check_availability, escalate"
```

---

### Task 14: Write `lib/conversation/escalate.ts`

**Files:**
- Create: `apps/web/src/lib/conversation/escalate.ts`

- [ ] **Step 1: Create the module**

Create `apps/web/src/lib/conversation/escalate.ts`:

```ts
import { db, eq } from '@omnilease/db';
import { conversations, escalations, properties } from '@omnilease/db';
import { sendEscalationEmail } from '@/lib/email/resend';

export type EscalateInput = {
  conversationId: string;
  propertyId: string;
  reason: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
};

/**
 * Persist an escalation and fan out the notification. Called by the engine
 * after a tool_use → escalate_to_human, or after the safety filter
 * auto-escalates. Idempotent: calling twice for the same conversation is
 * safe (it just flips status again and writes a second row; the queue UI
 * in Plan 1c groups by conversation).
 */
export async function escalateConversation(input: EscalateInput): Promise<void> {
  // 1. Write the escalation row.
  await db.insert(escalations).values({
    conversationId: input.conversationId,
    reason: input.reason,
    priority: input.priority,
  });

  // 2. Flip the conversation status.
  await db
    .update(conversations)
    .set({
      status: 'escalated',
      escalatedAt: new Date(),
      escalationReason: input.reason,
    })
    .where(eq(conversations.id, input.conversationId));

  // 3. Look up the property for the notification email + prospect label.
  const [context] = await db
    .select({
      propertyName: properties.name,
      escalationEmail: properties.escalationEmail,
      prospectPhone: conversations.prospectPhone,
      prospectEmail: conversations.prospectEmail,
      prospectName: conversations.prospectName,
    })
    .from(conversations)
    .innerJoin(properties, eq(properties.id, conversations.propertyId))
    .where(eq(conversations.id, input.conversationId))
    .limit(1);

  if (!context) return;               // conversation vanished — nothing to do
  if (!context.escalationEmail) return; // property not configured — silent no-op; log in engine

  const prospectLabel =
    context.prospectName ?? context.prospectPhone ?? context.prospectEmail ?? 'unknown prospect';

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const conversationUrl = `${appUrl}/conversations/${input.conversationId}`;

  await sendEscalationEmail({
    to: context.escalationEmail,
    propertyName: context.propertyName,
    prospectLabel,
    reason: input.reason,
    conversationUrl,
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck
```
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/conversation/escalate.ts
git commit -m "feat(web): escalateConversation writes row, flips status, emails agent"
```

---

### Task 15: Write `lib/conversation/engine.ts`

**Files:**
- Create: `apps/web/src/lib/conversation/engine.ts`

- [ ] **Step 1: Create the module**

Create `apps/web/src/lib/conversation/engine.ts`:

```ts
import { generateText, stepCountIs } from 'ai';
import { db, eq } from '@omnilease/db';
import {
  properties as propertiesTable,
  unitTypes as unitTypesTable,
  propertyKnowledge as propertyKnowledgeTable,
  messages as messagesTable,
  conversations as conversationsTable,
} from '@omnilease/db';
import { buildSystemPrompt } from './system-prompt';
import { loadHistory } from './history';
import { buildConversationTools } from './tools';
import { applySafetyFilter } from './safety';
import { classifyIntent } from './intent';
import { escalateConversation } from './escalate';

// Model string format: "<provider>/<model>". AI Gateway routes based on the
// string alone — auth comes from VERCEL_OIDC_TOKEN, provisioned automatically
// by `vercel env pull` when the project is linked and AI Gateway is enabled.
const MODEL = 'anthropic/claude-sonnet-4.6';

export type ProcessConversationInput = {
  conversationId: string;
  propertyId: string;
  inboundText: string;
};

export type ProcessConversationResult = {
  assistantText: string;
  escalated: boolean;
  intent: string;
  confidence: number;
};

/**
 * Core entry point — both the SMS webhook (via `after()`) and the widget
 * route call this. The widget path uses a streaming variant implemented
 * separately in Plan 1b; this function is for the non-streaming case.
 */
export async function processConversation(
  input: ProcessConversationInput,
): Promise<ProcessConversationResult> {
  // 1. Load everything needed for the system prompt.
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, input.propertyId))
    .limit(1);
  if (!property) throw new Error(`property not found: ${input.propertyId}`);

  const units = await db
    .select()
    .from(unitTypesTable)
    .where(eq(unitTypesTable.propertyId, input.propertyId));

  const knowledge = await db
    .select({
      category: propertyKnowledgeTable.category,
      content: propertyKnowledgeTable.content,
    })
    .from(propertyKnowledgeTable)
    .where(eq(propertyKnowledgeTable.propertyId, input.propertyId));

  // 2. Classify intent for the system prompt hint and for the return value.
  //    The route handler in Plan 1b (which owns the inbound message row) is
  //    responsible for writing `metadata.intent` on the row. This function
  //    only reads it back.
  const intent = classifyIntent(input.inboundText);

  // 3. Build the prompt + tools.
  const systemPrompt = buildSystemPrompt({
    property: {
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      timezone: property.timezone,
      officeHours: property.officeHours,
      welcomeMessage: property.welcomeMessage,
    },
    unitTypes: units.map((u) => ({
      name: u.name,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      sqftMin: u.sqftMin,
      sqftMax: u.sqftMax,
      priceMin: u.priceMin,
      priceMax: u.priceMax,
      availableCount: u.availableCount,
      deposit: u.deposit,
      description: u.description,
      isActive: u.isActive,
    })),
    knowledge: knowledge.map((k) => ({ category: k.category, content: k.content })),
  });

  const tools = buildConversationTools({
    conversationId: input.conversationId,
    propertyId: input.propertyId,
  });

  // 4. Load prior history and append the new inbound.
  const history = await loadHistory(input.conversationId, 20);
  const historyWithNew: typeof history = [
    ...history,
    { role: 'user', content: input.inboundText },
  ];

  // 5. Call the model via AI Gateway. generateText accepts ModelMessage-shaped
  //    objects directly — no need for convertToModelMessages (that helper is
  //    for UIMessages coming from useChat).
  const result = await generateText({
    model: MODEL,
    system: `${systemPrompt}\n\n[Detected intent: ${intent}]`,
    messages: historyWithNew.map((t) => ({ role: t.role, content: t.content })),
    tools,
    stopWhen: stepCountIs(4),
  });

  // 6. Handle escalation side-effect: if the model called escalate_to_human,
  //    invoke the real escalation pipeline (writes row, sends email).
  let escalated = false;
  for (const step of result.steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolName === 'escalate_to_human') {
        const args = call.input as { reason: string; priority: 'low' | 'normal' | 'high' | 'urgent' };
        await escalateConversation({
          conversationId: input.conversationId,
          propertyId: input.propertyId,
          reason: args.reason,
          priority: args.priority,
        });
        escalated = true;
      }
    }
  }

  // 7. Run the final text through the safety filter.
  const finalText = result.text ?? '';
  const safety = applySafetyFilter(finalText);

  // 8. Auto-escalate on low confidence, if not already escalated.
  if (!escalated && safety.autoEscalate) {
    await escalateConversation({
      conversationId: input.conversationId,
      propertyId: input.propertyId,
      reason: `Low confidence response (score ${safety.confidence.toFixed(2)})`,
      priority: 'normal',
    });
    escalated = true;
  }

  // 9. Persist the assistant turn.
  await db.insert(messagesTable).values({
    conversationId: input.conversationId,
    role: 'assistant',
    authorType: 'ai',
    content: safety.text,
    channel: 'sms', // overwritten by widget-specific path in Plan 1b
    confidenceScore: String(safety.confidence),
    toolCalls: result.steps?.flatMap((s) => s.toolCalls ?? []) ?? null,
    metadata: safety.flagged ? { safety_flag: true } : null,
  });

  return {
    assistantText: safety.text,
    escalated,
    intent,
    confidence: safety.confidence,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @omnilease/web typecheck
```
Expected: passes. The AI SDK v6 `result.steps` shape may differ slightly — if the `for-of` over `step.toolCalls` doesn't typecheck, consult the AI SDK v6 docs for the exact property name on `GenerateTextResult` (it's `steps[i].toolCalls` as of v6.0, but verify). Fix the property access, keep the loop structure.

Also, the `messagesTable.metadata` column is typed `jsonb`, so the null-or-object assignment should compile. If not, use `sql`null``.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/conversation/engine.ts
git commit -m "feat(web): processConversation — full engine pipeline (prompt, LLM, tools, safety, escalation)"
```

---

### Task 16: Integration test — `engine.int.test.ts`

**Files:**
- Create: `apps/web/src/lib/conversation/__tests__/engine.int.test.ts`

This test hits real Supabase (local `supabase start`) and mocks only the AI SDK `generateText` call at the module boundary. No other mocks.

- [ ] **Step 1: Ensure local Supabase is running**

```bash
supabase status
```
Expected: running. If not:
```bash
supabase start
```

Copy the local API URL and DB URL into `apps/web/.env.test.local` (create if missing):
```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
RESEND_API_KEY=re_fake
RESEND_FROM_EMAIL=Test <test@example.com>
APP_URL=http://localhost:3000
```

- [ ] **Step 2: Apply migrations to local Supabase**

```bash
cd packages/db
pnpm exec drizzle-kit push
```

- [ ] **Step 3: Write the integration test**

Create `apps/web/src/lib/conversation/__tests__/engine.int.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { db, eq } from '@omnilease/db';
import {
  organizations, properties, propertyKnowledge, unitTypes,
  conversations, messages, escalations,
} from '@omnilease/db';

// Mock ONLY the AI SDK generateText call + the Resend send. Everything else
// (DB, drizzle, safety, tools, escalation pipeline) is real.
const generateTextMock = vi.fn();
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: generateTextMock };
});

const resendSendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/email/resend', () => ({
  sendEscalationEmail: resendSendMock,
}));

// Import AFTER mocks so the engine picks them up.
import { processConversation } from '../engine';

const TEST_PREFIX = 'int-test-';

async function seedProperty() {
  const [org] = await db.insert(organizations).values({
    name: `${TEST_PREFIX}org`,
    slug: `${TEST_PREFIX}org-${Date.now()}`,
    plan: 'starter',
  }).returning();

  const [prop] = await db.insert(properties).values({
    orgId: org.id,
    name: 'Sunset Ridge',
    address: '123 Main St',
    city: 'Pensacola',
    state: 'FL',
    timezone: 'America/Chicago',
    escalationEmail: 'manager@example.com',
    welcomeMessage: null,
  }).returning();

  await db.insert(unitTypes).values([
    {
      propertyId: prop.id,
      name: '1BR/1BA',
      bedrooms: 1,
      bathrooms: '1',
      sqftMin: 650,
      sqftMax: 720,
      priceMin: '1500',
      priceMax: '1700',
      availableCount: 3,
      deposit: '500',
      isActive: true,
    },
  ]);

  await db.insert(propertyKnowledge).values({
    propertyId: prop.id,
    category: 'pets',
    content: { dogsAllowed: true, maxWeightLbs: 75, petRent: 35 },
  });

  const [conv] = await db.insert(conversations).values({
    propertyId: prop.id,
    channel: 'sms',
    externalId: '+15551234567',
    status: 'active',
  }).returning();

  await db.insert(messages).values({
    conversationId: conv.id,
    role: 'user',
    authorType: 'prospect',
    content: 'Do you allow dogs?',
    channel: 'sms',
  });

  return { orgId: org.id, propertyId: prop.id, conversationId: conv.id };
}

async function cleanup(orgId: string) {
  // Cascades via FKs: organizations -> properties -> conversations -> messages.
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

describe('processConversation (integration)', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    resendSendMock.mockReset();
  });

  it('happy path — generates a reply, persists it, returns intent + confidence', async () => {
    const { orgId, propertyId, conversationId } = await seedProperty();
    try {
      generateTextMock.mockResolvedValue({
        text: 'Yes — we welcome dogs up to 75 lbs! Want to come see a 1BR?',
        steps: [],
      });

      const result = await processConversation({
        conversationId,
        propertyId,
        inboundText: 'Do you allow dogs? I have a 60lb golden',
      });

      expect(result.intent).toBe('pets');
      expect(result.escalated).toBe(false);
      expect(result.assistantText).toContain('75 lbs');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);

      const rows = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
      expect(rows.length).toBe(2); // inbound + assistant
      const assistant = rows.find((r) => r.role === 'assistant');
      expect(assistant?.authorType).toBe('ai');
      expect(assistant?.content).toContain('75 lbs');
    } finally {
      await cleanup(orgId);
    }
  });

  it('escalates when the model calls escalate_to_human and emails the agent', async () => {
    const { orgId, propertyId, conversationId } = await seedProperty();
    try {
      generateTextMock.mockResolvedValue({
        text: "Got it — one of our team members will follow up with you shortly.",
        steps: [
          {
            toolCalls: [
              {
                toolName: 'escalate_to_human',
                input: { reason: 'Prospect asked to speak with a human', priority: 'normal' },
              },
            ],
          },
        ],
      });

      const result = await processConversation({
        conversationId,
        propertyId,
        inboundText: 'Can I talk to a real person please',
      });

      expect(result.escalated).toBe(true);

      const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
      expect(conv.status).toBe('escalated');

      const escalationRows = await db.select().from(escalations).where(eq(escalations.conversationId, conversationId));
      expect(escalationRows.length).toBe(1);
      expect(escalationRows[0].reason).toContain('speak with a human');

      expect(resendSendMock).toHaveBeenCalledTimes(1);
      const arg = resendSendMock.mock.calls[0][0];
      expect(arg.to).toBe('manager@example.com');
      expect(arg.propertyName).toBe('Sunset Ridge');
    } finally {
      await cleanup(orgId);
    }
  });

  it('auto-escalates on low confidence and replaces flagged text', async () => {
    const { orgId, propertyId, conversationId } = await seedProperty();
    try {
      generateTextMock.mockResolvedValue({
        text: "I'm not sure. I think maybe it might be family-friendly? I don't really know.",
        steps: [],
      });

      const result = await processConversation({
        conversationId,
        propertyId,
        inboundText: 'Is this a good neighborhood?',
      });

      expect(result.escalated).toBe(true);
      expect(result.assistantText).not.toContain('family-friendly');
      expect(resendSendMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup(orgId);
    }
  });
});
```

- [ ] **Step 4: Run the test and fix until green**

```bash
pnpm --filter @omnilease/web test src/lib/conversation/__tests__/engine.int.test.ts
```
Expected: PASS (3 tests). Likely failure modes:
- Env not loaded: make sure Vitest loads `.env.test.local` (may need `dotenv` in `vitest.config.ts`).
- Drizzle types: if `result.steps[i].toolCalls[i].input` is typed differently in AI SDK v6, adjust the engine and this test to match (the engine owns the contract, the test follows).
- Cascade delete: if `organizations` doesn't cascade to `conversations` on your local schema, delete explicitly in reverse order.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/conversation/__tests__/engine.int.test.ts
git commit -m "test(web): integration test for processConversation — happy/escalate/safety paths"
```

---

### Task 17: Run the full web test suite + typecheck and commit the clean state

**Files:** none

- [ ] **Step 1: Run the whole web suite**

```bash
pnpm --filter @omnilease/web test
```
Expected: all tests pass. This catches drift between the unit tests (intent/safety/system-prompt/resend) and the integration test.

- [ ] **Step 2: Typecheck the whole workspace**

```bash
pnpm -r typecheck
```
Expected: clean.

- [ ] **Step 3: Typecheck the db package specifically**

```bash
pnpm --filter @omnilease/db typecheck
```
Expected: clean.

- [ ] **Step 4: Commit (if anything was adjusted)**

If the test run or typecheck required any fix-ups:
```bash
git add -A
git commit -m "fix: post-plan-1a typecheck + test cleanup"
```
If nothing changed, skip the commit.

- [ ] **Step 5: Final sanity — confirm `apps/mobile` is really gone**

```bash
test -d apps/mobile && echo "STILL PRESENT" || echo "deleted"
```
Expected: `deleted`.

---

## Definition of Done

Plan 1a is complete when all of the following are true:

1. `apps/mobile/` is deleted and the auto-memory file reflects the new product direction.
2. Migrations `0003` and `0004` apply cleanly against a fresh local Supabase.
3. `packages/db/src/schema/tcpa.ts` exists and is exported from the schema barrel.
4. `packages/shared/src/roles.ts` defines `admin | manager | agent` and every `apps/web` caller has been updated.
5. `apps/web/src/lib/email/resend.ts` exists with unit tests green.
6. `apps/web/src/lib/conversation/{intent,safety,history,system-prompt,tools,escalate,engine}.ts` all exist.
7. Unit tests pass for `intent`, `safety`, and `system-prompt`.
8. Integration test `engine.int.test.ts` passes against real Supabase + mocked AI Gateway, exercising happy / escalate / safety-auto-escalate paths.
9. `pnpm -r typecheck` is clean.
10. No tasks in Plan 1b or 1c have been started — the SMS webhook, widget, and dashboard pages remain for those plans.

Plan 1b (SMS + widget channels) picks up next, calling `processConversation` from the Twilio webhook and a streaming widget route.
