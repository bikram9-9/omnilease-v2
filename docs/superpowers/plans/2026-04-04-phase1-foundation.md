# OmniLease Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a multi-tenant Next.js SaaS that lets a property manager sign up, create an organization, add properties, configure their knowledge base (pricing, pets, parking, amenities, FAQs), and manage unit types — the data foundation the conversation engine will read from in Plan 2.

**Architecture:** Single Next.js 16 app deployed on Vercel, using Server Components + Server Actions for UI mutations and Route Handlers for (future) webhooks. Multi-tenancy is app-scoped: every query derives `orgId` from `await auth()` (Clerk) and filters by it. Drizzle ORM with Neon's serverless driver keeps DB access typed and edge-safe.

**Tech Stack:** Next.js 16, TypeScript, Clerk (auth + orgs), Neon Postgres, Drizzle ORM, Tailwind CSS, shadcn/ui, Zod, Vitest, pnpm + Turborepo.

**Non-goals for this plan:** No SMS, no Claude integration, no webchat widget, no conversation viewing, no analytics, no queue/worker. Those come in Plans 2 and 3.

---

## File Structure

```
omnilease-service-v2/
├── package.json                       # root workspace config
├── pnpm-workspace.yaml
├── turbo.json
├── .gitignore
├── .nvmrc                             # Node 20
├── apps/
│   └── web/                           # Next.js 16 app
│       ├── package.json
│       ├── next.config.ts
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       ├── postcss.config.mjs
│       ├── components.json            # shadcn/ui config
│       ├── proxy.ts                   # Clerk middleware (Next.js 16)
│       ├── .env.local                 # gitignored
│       ├── .env.example
│       └── src/
│           ├── app/
│           │   ├── layout.tsx         # ClerkProvider + root layout
│           │   ├── page.tsx           # public landing
│           │   ├── globals.css
│           │   ├── sign-in/[[...sign-in]]/page.tsx
│           │   ├── sign-up/[[...sign-up]]/page.tsx
│           │   ├── onboarding/
│           │   │   ├── page.tsx       # org creation flow
│           │   │   └── actions.ts
│           │   └── (dashboard)/
│           │       ├── layout.tsx     # protected layout w/ sidebar
│           │       ├── page.tsx       # dashboard home
│           │       └── properties/
│           │           ├── page.tsx   # list
│           │           ├── new/page.tsx
│           │           ├── actions.ts # server actions for CRUD
│           │           └── [id]/
│           │               ├── page.tsx        # details + tabs shell
│           │               ├── edit/page.tsx
│           │               ├── units/page.tsx
│           │               ├── units/actions.ts
│           │               ├── knowledge/page.tsx
│           │               └── knowledge/actions.ts
│           ├── components/
│           │   ├── ui/                # shadcn components
│           │   └── dashboard/
│           │       ├── sidebar.tsx
│           │       └── top-bar.tsx
│           └── lib/
│               ├── auth.ts            # requireOrg() guard + types
│               ├── validators.ts      # Zod schemas
│               └── utils.ts           # cn() etc.
├── packages/
│   └── db/                            # Drizzle schema + client
│       ├── package.json
│       ├── tsconfig.json
│       ├── drizzle.config.ts
│       ├── src/
│       │   ├── index.ts               # exported db client
│       │   ├── schema/
│       │   │   ├── index.ts           # barrel
│       │   │   ├── tenancy.ts         # organizations, users
│       │   │   ├── properties.ts      # properties, unit_types, property_knowledge
│       │   │   └── conversations.ts   # conversations, messages, escalations
│       │   └── schema.test.ts
│       └── drizzle/                   # generated migrations
└── docs/
    └── superpowers/
        ├── specs/
        └── plans/
            └── 2026-04-04-phase1-foundation.md
```

**Responsibility boundaries:**
- `packages/db` owns schema, migrations, and the `db` client. Nothing else imports `drizzle-orm` directly.
- `apps/web/src/lib/auth.ts` owns the multi-tenancy guard (`requireOrg()`). Every server action and protected page calls it first.
- Server actions live next to the pages that use them (colocation over layering).
- Zod validators live in `apps/web/src/lib/validators.ts` and are reused by forms + server actions.

---

## Tasks

### Task 1: Initialize pnpm monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.nvmrc`

- [ ] **Step 1: Check prerequisites**

Run:
```bash
node --version    # expect v20.x or v22.x
pnpm --version    # expect 9.x; if missing: npm i -g pnpm@9
```

- [ ] **Step 2: Create `.nvmrc`**

```
20
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 4: Create root `package.json`**

```json
{
  "name": "omnilease",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "db:generate": "pnpm --filter @omnilease/db db:generate",
    "db:migrate": "pnpm --filter @omnilease/db db:migrate",
    "db:studio": "pnpm --filter @omnilease/db db:studio"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.6.0"
  },
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 5: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "db:generate": { "cache": false },
    "db:migrate": { "cache": false },
    "db:studio": { "cache": false, "persistent": true }
  }
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules
.next
.turbo
dist
.env
.env.local
.env.*.local
*.log
.DS_Store
.vercel
coverage
drizzle/meta
```

- [ ] **Step 7: Install root deps and commit**

Run:
```bash
pnpm install
```
Expected: installs turbo + typescript, creates `pnpm-lock.yaml`.

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .nvmrc pnpm-lock.yaml
git commit -m "feat: initialize pnpm + turborepo monorepo scaffold"
```

---

### Task 2: Bootstrap the Next.js 16 app

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/.env.example`

- [ ] **Step 1: Scaffold the Next.js app directory**

Run:
```bash
mkdir -p apps/web/src/app
cd apps/web
```

- [ ] **Step 2: Create `apps/web/package.json`**

```json
{
  "name": "@omnilease/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbo -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@omnilease/db": "workspace:*",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.12.0",
    "eslint-config-next": "^16.0.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.0",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 3: Create `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `apps/web/next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@omnilease/db'],
};

export default nextConfig;
```

- [ ] **Step 5: Create `apps/web/postcss.config.mjs` and `tailwind.config.ts`**

`postcss.config.mjs`:
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 6: Create `apps/web/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create `apps/web/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OmniLease',
  description: 'AI leasing assistant for multifamily operators',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-50 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Create `apps/web/src/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight">OmniLease</h1>
        <p className="mt-4 text-zinc-400">AI leasing assistant for multifamily operators.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Create `apps/web/.env.example`**

```
# Database (Neon)
DATABASE_URL=postgresql://user:password@host/db?sslmode=require

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/onboarding
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
```

- [ ] **Step 10: Install and verify the app boots**

Run from repo root:
```bash
pnpm install
pnpm --filter @omnilease/web dev
```
Expected: Next.js boots on http://localhost:3000 with the "OmniLease" landing page. Kill the server (Ctrl+C).

- [ ] **Step 11: Commit**

```bash
git add apps/web
git commit -m "feat(web): bootstrap Next.js 16 app with Tailwind"
```

---

### Task 3: Provision Neon Postgres + Drizzle package

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: Provision Neon via Vercel Marketplace**

The Neon integration must be installed manually by the user (CLI requires interactive terms acceptance):
```bash
vercel integration add neon
```
After install, user creates a database in the Neon dashboard and copies `DATABASE_URL` into `apps/web/.env.local`.

**Pause point:** confirm `DATABASE_URL` is set in `apps/web/.env.local` before continuing.

- [ ] **Step 2: Create `packages/db/package.json`**

```json
{
  "name": "@omnilease/db",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.0",
    "drizzle-orm": "^0.36.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "dotenv": "^16.4.5",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 3: Create `packages/db/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*", "drizzle.config.ts"]
}
```

- [ ] **Step 4: Create `packages/db/drizzle.config.ts`**

```ts
import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

- [ ] **Step 5: Create `packages/db/src/index.ts`**

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });

export * from './schema';
export type Database = typeof db;
```

- [ ] **Step 6: Create empty `packages/db/src/schema/index.ts`**

```ts
// Barrel file — populated in tasks 4, 5, 6.
export {};
```

- [ ] **Step 7: Install and verify**

Run from repo root:
```bash
pnpm install
pnpm --filter @omnilease/db typecheck
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): scaffold Drizzle + Neon client package"
```

---

### Task 4: Define tenancy schema (organizations, users)

**Files:**
- Create: `packages/db/src/schema/tenancy.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/schema.test.ts`

- [ ] **Step 1: Write schema test**

Create `packages/db/src/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { organizations, users } from './schema';

describe('tenancy schema', () => {
  it('organizations has required columns', () => {
    const cols = Object.keys(organizations);
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'name', 'slug', 'plan', 'createdAt']),
    );
  });

  it('users references organizations', () => {
    const cols = Object.keys(users);
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'clerkUserId', 'orgId', 'email', 'role']),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @omnilease/db test
```
Expected: FAIL with "Cannot find module './schema'" or "organizations is undefined".

- [ ] **Step 3: Create `packages/db/src/schema/tenancy.ts`**

```ts
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    clerkOrgId: text('clerk_org_id').notNull().unique(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    plan: text('plan').notNull().default('starter'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clerkOrgIdx: uniqueIndex('organizations_clerk_org_idx').on(t.clerkOrgId),
  }),
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    clerkUserId: text('clerk_user_id').notNull().unique(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    role: text('role').notNull().default('agent'), // admin | manager | agent
    phone: text('phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clerkUserIdx: uniqueIndex('users_clerk_user_idx').on(t.clerkUserId),
    orgIdx: index('users_org_idx').on(t.orgId),
  }),
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 4: Update barrel `packages/db/src/schema/index.ts`**

```ts
export * from './tenancy';
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm --filter @omnilease/db test
```
Expected: PASS (2 tests).

- [ ] **Step 6: Generate and apply migration**

Run:
```bash
pnpm --filter @omnilease/db exec drizzle-kit generate --name init_tenancy
pnpm --filter @omnilease/db exec drizzle-kit migrate
```
Expected: migration file created under `packages/db/drizzle/`, then applied to Neon. Verify in Neon console that `organizations` and `users` tables exist.

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): add organizations and users tables"
```

---

### Task 5: Define property schema (properties, unit_types, property_knowledge)

**Files:**
- Create: `packages/db/src/schema/properties.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema.test.ts`

- [ ] **Step 1: Extend the schema test**

Append to `packages/db/src/schema.test.ts`:
```ts
import { properties, unitTypes, propertyKnowledge } from './schema';

describe('property schema', () => {
  it('properties has required columns', () => {
    const cols = Object.keys(properties);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'orgId', 'name', 'address', 'city', 'state', 'zip',
        'timezone', 'officeHours', 'twilioPhone', 'webchatWidgetId',
      ]),
    );
  });

  it('unitTypes references properties', () => {
    const cols = Object.keys(unitTypes);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'propertyId', 'name', 'bedrooms', 'bathrooms',
        'priceMin', 'priceMax', 'availableCount', 'isActive',
      ]),
    );
  });

  it('propertyKnowledge stores JSONB per category', () => {
    const cols = Object.keys(propertyKnowledge);
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'propertyId', 'category', 'content']),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @omnilease/db test
```
Expected: FAIL (imports undefined).

- [ ] **Step 3: Create `packages/db/src/schema/properties.ts`**

```ts
import {
  pgTable, uuid, text, timestamp, integer, numeric, boolean,
  jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './tenancy';

export type OfficeHours = {
  [day in 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun']?: {
    open: string; // "09:00"
    close: string; // "18:00"
  };
};

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    zip: text('zip'),
    timezone: text('timezone').notNull().default('America/New_York'),
    officeHours: jsonb('office_hours').$type<OfficeHours>(),
    twilioPhone: text('twilio_phone'),
    webchatWidgetId: text('webchat_widget_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('properties_org_idx').on(t.orgId),
    twilioPhoneIdx: uniqueIndex('properties_twilio_phone_idx').on(t.twilioPhone),
  }),
);

export const unitTypes = pgTable(
  'unit_types',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    bedrooms: integer('bedrooms').notNull(),
    bathrooms: numeric('bathrooms', { precision: 3, scale: 1 }).notNull(),
    sqftMin: integer('sqft_min'),
    sqftMax: integer('sqft_max'),
    priceMin: numeric('price_min', { precision: 10, scale: 2 }),
    priceMax: numeric('price_max', { precision: 10, scale: 2 }),
    availableCount: integer('available_count').notNull().default(0),
    deposit: numeric('deposit', { precision: 10, scale: 2 }),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('unit_types_property_idx').on(t.propertyId),
  }),
);

export type KnowledgeCategory =
  | 'pricing' | 'pets' | 'parking' | 'amenities' | 'lease_terms'
  | 'move_in_costs' | 'utilities' | 'neighborhood' | 'faqs';

export const propertyKnowledge = pgTable(
  'property_knowledge',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    category: text('category').$type<KnowledgeCategory>().notNull(),
    content: jsonb('content').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyCategoryIdx: uniqueIndex('property_knowledge_property_category_idx').on(
      t.propertyId, t.category,
    ),
  }),
);

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type UnitType = typeof unitTypes.$inferSelect;
export type NewUnitType = typeof unitTypes.$inferInsert;
export type PropertyKnowledge = typeof propertyKnowledge.$inferSelect;
export type NewPropertyKnowledge = typeof propertyKnowledge.$inferInsert;
```

- [ ] **Step 4: Update barrel**

`packages/db/src/schema/index.ts`:
```ts
export * from './tenancy';
export * from './properties';
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm --filter @omnilease/db test
```
Expected: PASS (5 tests).

- [ ] **Step 6: Generate and apply migration**

Run:
```bash
pnpm --filter @omnilease/db exec drizzle-kit generate --name properties
pnpm --filter @omnilease/db exec drizzle-kit migrate
```
Expected: migration created and applied. Verify tables in Neon console.

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): add properties, unit_types, property_knowledge tables"
```

---

### Task 6: Define conversation schema (conversations, messages, escalations)

**Files:**
- Create: `packages/db/src/schema/conversations.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema.test.ts`

> Note: these tables are created now (Plan 1) so migrations are in one place, even though they're only populated in Plan 2.

- [ ] **Step 1: Extend the schema test**

Append to `packages/db/src/schema.test.ts`:
```ts
import { conversations, messages, escalations } from './schema';

describe('conversation schema', () => {
  it('conversations has channel + status', () => {
    const cols = Object.keys(conversations);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'propertyId', 'channel', 'externalId', 'status',
        'prospectPhone', 'prospectEmail', 'prospectName',
      ]),
    );
  });

  it('messages stores role + content', () => {
    const cols = Object.keys(messages);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'conversationId', 'role', 'content', 'channel',
        'tokensUsed', 'llmCost',
      ]),
    );
  });

  it('escalations has priority + resolvedAt', () => {
    const cols = Object.keys(escalations);
    expect(cols).toEqual(
      expect.arrayContaining([
        'id', 'conversationId', 'reason', 'priority', 'resolvedAt',
      ]),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @omnilease/db test
```
Expected: FAIL (imports undefined).

- [ ] **Step 3: Create `packages/db/src/schema/conversations.ts`**

```ts
import {
  pgTable, uuid, text, timestamp, integer, numeric, jsonb, index, date,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { properties } from './properties';
import { users } from './tenancy';

export type ConversationChannel = 'sms' | 'email' | 'webchat' | 'voice';
export type ConversationStatus = 'active' | 'escalated' | 'closed' | 'converted';
export type MessageRole = 'user' | 'assistant' | 'system';
export type EscalationPriority = 'low' | 'normal' | 'high' | 'urgent';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
    channel: text('channel').$type<ConversationChannel>().notNull(),
    externalId: text('external_id').notNull(), // phone / email / webchat session id
    prospectName: text('prospect_name'),
    prospectEmail: text('prospect_email'),
    prospectPhone: text('prospect_phone'),
    status: text('status').$type<ConversationStatus>().notNull().default('active'),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    escalationReason: text('escalation_reason'),
    assignedAgentId: uuid('assigned_agent_id').references(() => users.id),
    moveInDate: date('move_in_date'),
    unitPreference: text('unit_preference'),
    leadScore: integer('lead_score'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('conversations_property_idx').on(t.propertyId),
    statusIdx: index('conversations_status_idx').on(t.status),
    externalIdx: index('conversations_external_idx').on(t.externalId),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').$type<MessageRole>().notNull(),
    content: text('content').notNull(),
    channel: text('channel').$type<ConversationChannel>().notNull(),
    tokensUsed: integer('tokens_used'),
    llmCost: numeric('llm_cost', { precision: 10, scale: 6 }),
    confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }),
    toolCalls: jsonb('tool_calls'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index('messages_conversation_idx').on(t.conversationId),
    createdAtIdx: index('messages_created_at_idx').on(t.createdAt),
  }),
);

export const escalations = pgTable(
  'escalations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    priority: text('priority').$type<EscalationPriority>().notNull().default('normal'),
    assignedTo: uuid('assigned_to').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    openIdx: index('escalations_open_idx').on(t.resolvedAt),
  }),
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Escalation = typeof escalations.$inferSelect;
export type NewEscalation = typeof escalations.$inferInsert;
```

- [ ] **Step 4: Update barrel**

`packages/db/src/schema/index.ts`:
```ts
export * from './tenancy';
export * from './properties';
export * from './conversations';
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm --filter @omnilease/db test
```
Expected: PASS (8 tests).

- [ ] **Step 6: Generate and apply migration**

Run:
```bash
pnpm --filter @omnilease/db exec drizzle-kit generate --name conversations
pnpm --filter @omnilease/db exec drizzle-kit migrate
```
Expected: migration created and applied.

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): add conversations, messages, escalations tables"
```

---

### Task 7: Integrate Clerk authentication

**Files:**
- Create: `apps/web/proxy.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `apps/web/src/app/sign-up/[[...sign-up]]/page.tsx`
- Create: `apps/web/src/lib/auth.ts`

- [ ] **Step 1: Install Clerk**

Run:
```bash
pnpm --filter @omnilease/web add @clerk/nextjs
```

- [ ] **Step 2: Set Clerk env vars**

User creates a Clerk application at https://dashboard.clerk.com (or `vercel integration add clerk`), enables **Organizations** in Clerk → Configure → Organizations, then pastes keys into `apps/web/.env.local`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/onboarding
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
```

**Pause point:** confirm keys are set before continuing.

- [ ] **Step 3: Create `apps/web/proxy.ts`**

> In Next.js 16 the file is `proxy.ts`, at the same level as `src/app`. Since we use `src/`, it lives at `apps/web/proxy.ts` (repo path) — but Next.js expects it next to `app`, so the actual path is `apps/web/src/proxy.ts`. Check which your Next 16 expects and move if needed.

Create at `apps/web/src/proxy.ts`:
```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/onboarding(.*)',
  '/dashboard(.*)',
  '/properties(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

- [ ] **Step 4: Wrap root layout with ClerkProvider**

Update `apps/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'OmniLease',
  description: 'AI leasing assistant for multifamily operators',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className="bg-zinc-950 text-zinc-50 antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 5: Create sign-in / sign-up catch-all pages**

`apps/web/src/app/sign-in/[[...sign-in]]/page.tsx`:
```tsx
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <SignIn />
    </main>
  );
}
```

`apps/web/src/app/sign-up/[[...sign-up]]/page.tsx`:
```tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 6: Create `apps/web/src/lib/auth.ts` (tenant guard)**

```ts
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db, organizations, users } from '@omnilease/db';
import { eq } from 'drizzle-orm';

export type AuthContext = {
  userId: string;        // internal users.id
  clerkUserId: string;
  orgId: string;         // internal organizations.id
  clerkOrgId: string;
  role: string;
};

/**
 * Loads the current user and their active organization. Redirects to
 * /sign-in if not signed in, /onboarding if signed in but no org is
 * selected or the org hasn't been synced to our DB yet.
 */
export async function requireOrg(): Promise<AuthContext> {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();

  if (!clerkUserId) redirect('/sign-in');
  if (!clerkOrgId) redirect('/onboarding');

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.clerkOrgId, clerkOrgId))
    .limit(1);

  if (!org) redirect('/onboarding');

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) redirect('/onboarding');

  return {
    userId: user.id,
    clerkUserId,
    orgId: org.id,
    clerkOrgId,
    role: user.role,
  };
}
```

- [ ] **Step 7: Verify dev server boots with Clerk**

Run:
```bash
pnpm --filter @omnilease/web dev
```
Visit http://localhost:3000/sign-in — expect the Clerk sign-in widget to render. Create an account. You'll be redirected to `/onboarding` (which 404s — fixed next task).

Kill the server.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): integrate Clerk auth + multi-tenant guard"
```

---

### Task 8: Organization onboarding flow

**Files:**
- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/app/onboarding/actions.ts`

- [ ] **Step 1: Create the onboarding server action**

Create `apps/web/src/app/onboarding/actions.ts`:
```ts
'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db, organizations, users } from '@omnilease/db';
import { eq } from 'drizzle-orm';

export async function syncOrgFromClerk() {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();
  if (!clerkUserId || !clerkOrgId) redirect('/sign-in');

  const client = await clerkClient();
  const clerkOrg = await client.organizations.getOrganization({ organizationId: clerkOrgId });
  const clerkUser = await client.users.getUser(clerkUserId);

  // Upsert organization
  const [existingOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.clerkOrgId, clerkOrgId))
    .limit(1);

  let orgRow = existingOrg;
  if (!orgRow) {
    [orgRow] = await db
      .insert(organizations)
      .values({
        clerkOrgId,
        name: clerkOrg.name,
        slug: clerkOrg.slug ?? clerkOrgId,
      })
      .returning();
  }

  // Upsert user
  const email = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress;
  if (!email) throw new Error('User has no primary email');

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!existingUser) {
    await db.insert(users).values({
      clerkUserId,
      orgId: orgRow.id,
      email,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
      role: 'admin', // first user in an org is admin
    });
  }

  redirect('/dashboard');
}
```

- [ ] **Step 2: Create the onboarding page**

Create `apps/web/src/app/onboarding/page.tsx`:
```tsx
import { auth } from '@clerk/nextjs/server';
import { CreateOrganization } from '@clerk/nextjs';
import { syncOrgFromClerk } from './actions';

export default async function OnboardingPage() {
  const { orgId } = await auth();

  // User created an org in Clerk — sync to our DB
  if (orgId) {
    await syncOrgFromClerk();
    // syncOrgFromClerk redirects, so we never reach here
    return null;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-center text-2xl font-semibold">Create your organization</h1>
        <CreateOrganization afterCreateOrganizationUrl="/onboarding" />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Manual E2E test**

Run:
```bash
pnpm --filter @omnilease/web dev
```
Flow:
1. Visit `/sign-up`, create account
2. Redirected to `/onboarding` — should show "Create your organization" form
3. Create an org — should auto-sync and redirect to `/dashboard` (404 for now, fixed next task)
4. In Neon console, run `SELECT * FROM organizations; SELECT * FROM users;` — expect 1 row in each.

Kill the server.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): org onboarding syncs Clerk org+user to DB"
```

---

### Task 9: Dashboard shell with shadcn/ui

**Files:**
- Create: `apps/web/components.json`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/components/dashboard/sidebar.tsx`
- Create: `apps/web/src/components/dashboard/top-bar.tsx`
- Create: `apps/web/src/app/(dashboard)/layout.tsx`
- Create: `apps/web/src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Install shadcn/ui**

Run:
```bash
cd apps/web
pnpm dlx shadcn@latest init -d
```
When prompted: style=default, baseColor=zinc, cssVariables=yes. This creates `components.json`, updates `globals.css` + `tailwind.config.ts`, and adds `src/lib/utils.ts`.

- [ ] **Step 2: Add starter shadcn components**

Run from `apps/web`:
```bash
pnpm dlx shadcn@latest add button card input label textarea select tabs dialog form separator
```

- [ ] **Step 3: Create the sidebar component**

`apps/web/src/components/dashboard/sidebar.tsx`:
```tsx
import Link from 'next/link';
import { Building2, Home, MessageSquare, Settings } from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Overview', icon: Home },
  { href: '/properties', label: 'Properties', icon: Building2 },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-8 px-2 text-lg font-semibold">OmniLease</div>
      <nav className="space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-50"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

Add the lucide icons package:
```bash
pnpm --filter @omnilease/web add lucide-react
```

- [ ] **Step 4: Create the top bar with user button**

`apps/web/src/components/dashboard/top-bar.tsx`:
```tsx
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6">
      <OrganizationSwitcher
        hidePersonal
        appearance={{ elements: { organizationSwitcherTrigger: 'text-zinc-200' } }}
      />
      <UserButton afterSignOutUrl="/" />
    </header>
  );
}
```

- [ ] **Step 5: Create the dashboard layout**

`apps/web/src/app/(dashboard)/layout.tsx`:
```tsx
import { requireOrg } from '@/lib/auth';
import { Sidebar } from '@/components/dashboard/sidebar';
import { TopBar } from '@/components/dashboard/top-bar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireOrg();
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create dashboard home page**

`apps/web/src/app/(dashboard)/dashboard/page.tsx`:
```tsx
import { requireOrg } from '@/lib/auth';
import { db, properties } from '@omnilease/db';
import { eq, count } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const { orgId } = await requireOrg();
  const [{ value: propertyCount }] = await db
    .select({ value: count() })
    .from(properties)
    .where(eq(properties.orgId, orgId));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{propertyCount}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">Conversations (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">—</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-400">Open escalations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">—</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify dashboard renders**

Run `pnpm --filter @omnilease/web dev`, sign in, confirm `/dashboard` renders with sidebar + top bar + 3 cards. Properties count = 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): dashboard shell with sidebar + top bar"
```

---

### Task 10: Property CRUD

**Files:**
- Create: `apps/web/src/lib/validators.ts`
- Create: `apps/web/src/app/(dashboard)/properties/page.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/new/page.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/actions.ts`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/page.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/edit/page.tsx`

- [ ] **Step 1: Write validator**

Create `apps/web/src/lib/validators.ts`:
```ts
import { z } from 'zod';

export const propertyInput = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  address: z.string().max(300).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(2).optional().or(z.literal('')),
  zip: z.string().max(10).optional().or(z.literal('')),
  timezone: z.string().default('America/New_York'),
});
export type PropertyInput = z.infer<typeof propertyInput>;
```

- [ ] **Step 2: Write validator test**

Create `apps/web/src/lib/validators.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { propertyInput } from './validators';

describe('propertyInput', () => {
  it('accepts minimal valid input', () => {
    expect(propertyInput.parse({ name: 'The Meridian' })).toMatchObject({
      name: 'The Meridian',
      timezone: 'America/New_York',
    });
  });

  it('rejects empty name', () => {
    expect(() => propertyInput.parse({ name: '' })).toThrow();
  });

  it('rejects state longer than 2 chars', () => {
    expect(() => propertyInput.parse({ name: 'x', state: 'California' })).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run:
```bash
pnpm --filter @omnilease/web test
```
Expected: PASS (3 tests).

- [ ] **Step 4: Create server actions**

`apps/web/src/app/(dashboard)/properties/actions.ts`:
```ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, properties } from '@omnilease/db';
import { and, eq } from 'drizzle-orm';
import { requireOrg } from '@/lib/auth';
import { propertyInput, type PropertyInput } from '@/lib/validators';

export async function createProperty(input: PropertyInput) {
  const { orgId } = await requireOrg();
  const data = propertyInput.parse(input);
  const [row] = await db
    .insert(properties)
    .values({ ...data, orgId })
    .returning({ id: properties.id });
  revalidatePath('/properties');
  redirect(`/properties/${row.id}`);
}

export async function updateProperty(id: string, input: PropertyInput) {
  const { orgId } = await requireOrg();
  const data = propertyInput.parse(input);
  await db
    .update(properties)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)));
  revalidatePath(`/properties/${id}`);
  revalidatePath('/properties');
  redirect(`/properties/${id}`);
}

export async function deleteProperty(id: string) {
  const { orgId } = await requireOrg();
  await db
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)));
  revalidatePath('/properties');
  redirect('/properties');
}
```

- [ ] **Step 5: Create properties list page**

`apps/web/src/app/(dashboard)/properties/page.tsx`:
```tsx
import Link from 'next/link';
import { db, properties } from '@omnilease/db';
import { eq, desc } from 'drizzle-orm';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default async function PropertiesPage() {
  const { orgId } = await requireOrg();
  const rows = await db
    .select()
    .from(properties)
    .where(eq(properties.orgId, orgId))
    .orderBy(desc(properties.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Properties</h1>
        <Button asChild><Link href="/properties/new">New property</Link></Button>
      </div>

      {rows.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="mb-4 text-zinc-400">No properties yet.</p>
            <Button asChild><Link href="/properties/new">Add your first property</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <Link key={p.id} href={`/properties/${p.id}`}>
              <Card className="border-zinc-800 bg-zinc-900 transition hover:border-zinc-700">
                <CardContent className="p-4">
                  <div className="font-medium">{p.name}</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create new-property form (client component)**

`apps/web/src/app/(dashboard)/properties/new/page.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { createProperty } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewPropertyPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createProperty({
          name: String(formData.get('name') ?? ''),
          address: String(formData.get('address') ?? ''),
          city: String(formData.get('city') ?? ''),
          state: String(formData.get('state') ?? ''),
          zip: String(formData.get('zip') ?? ''),
          timezone: String(formData.get('timezone') ?? 'America/New_York'),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create property');
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New property</h1>
      <form action={onSubmit} className="space-y-4">
        <Field id="name" label="Name" required />
        <Field id="address" label="Street address" />
        <div className="grid grid-cols-2 gap-4">
          <Field id="city" label="City" />
          <Field id="state" label="State (2-letter)" maxLength={2} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="zip" label="ZIP" maxLength={10} />
          <Field id="timezone" label="Timezone" defaultValue="America/New_York" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create property'}
        </Button>
      </form>
    </div>
  );
}

function Field(props: {
  id: string; label: string; required?: boolean; maxLength?: number; defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        name={props.id}
        required={props.required}
        maxLength={props.maxLength}
        defaultValue={props.defaultValue}
        className="bg-zinc-900 border-zinc-800"
      />
    </div>
  );
}
```

- [ ] **Step 7: Create property detail page**

`apps/web/src/app/(dashboard)/properties/[id]/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, properties } from '@omnilease/db';
import { and, eq } from 'drizzle-orm';
import { requireOrg } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default async function PropertyDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [p] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <p className="text-sm text-zinc-400">
            {[p.address, p.city, p.state, p.zip].filter(Boolean).join(', ') || '—'}
          </p>
        </div>
        <Button asChild variant="outline"><Link href={`/properties/${p.id}/edit`}>Edit</Link></Button>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details" asChild><Link href={`/properties/${p.id}`}>Details</Link></TabsTrigger>
          <TabsTrigger value="units" asChild><Link href={`/properties/${p.id}/units`}>Units</Link></TabsTrigger>
          <TabsTrigger value="knowledge" asChild><Link href={`/properties/${p.id}/knowledge`}>Knowledge</Link></TabsTrigger>
        </TabsList>
      </Tabs>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-zinc-400">Timezone</dt><dd>{p.timezone}</dd></div>
        <div><dt className="text-zinc-400">Twilio phone</dt><dd>{p.twilioPhone ?? '—'}</dd></div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 8: Create edit property page**

`apps/web/src/app/(dashboard)/properties/[id]/edit/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { db, properties } from '@omnilease/db';
import { and, eq } from 'drizzle-orm';
import { requireOrg } from '@/lib/auth';
import { EditForm } from './edit-form';

export default async function EditPropertyPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [p] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) notFound();
  return <EditForm property={p} />;
}
```

Create `apps/web/src/app/(dashboard)/properties/[id]/edit/edit-form.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { updateProperty, deleteProperty } from '../../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Property } from '@omnilease/db';

export function EditForm({ property }: { property: Property }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateProperty(property.id, {
          name: String(formData.get('name') ?? ''),
          address: String(formData.get('address') ?? ''),
          city: String(formData.get('city') ?? ''),
          state: String(formData.get('state') ?? ''),
          zip: String(formData.get('zip') ?? ''),
          timezone: String(formData.get('timezone') ?? 'America/New_York'),
        });
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    });
  }

  async function onDelete() {
    if (!confirm('Delete this property? This removes all units, knowledge, and conversations.')) return;
    startTransition(() => deleteProperty(property.id));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Edit property</h1>
      <form action={onSubmit} className="space-y-4">
        <Field id="name" label="Name" defaultValue={property.name} required />
        <Field id="address" label="Street address" defaultValue={property.address ?? ''} />
        <div className="grid grid-cols-2 gap-4">
          <Field id="city" label="City" defaultValue={property.city ?? ''} />
          <Field id="state" label="State (2-letter)" defaultValue={property.state ?? ''} maxLength={2} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="zip" label="ZIP" defaultValue={property.zip ?? ''} maxLength={10} />
          <Field id="timezone" label="Timezone" defaultValue={property.timezone} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>Save</Button>
          <Button type="button" variant="destructive" onClick={onDelete} disabled={isPending}>Delete</Button>
        </div>
      </form>
    </div>
  );
}

function Field(props: {
  id: string; label: string; required?: boolean; maxLength?: number; defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id} name={props.id} required={props.required}
        maxLength={props.maxLength} defaultValue={props.defaultValue}
        className="bg-zinc-900 border-zinc-800"
      />
    </div>
  );
}
```

- [ ] **Step 9: Manual E2E test**

Run `pnpm --filter @omnilease/web dev`:
1. `/properties` → empty state → click "Add your first property"
2. Fill form (name="The Meridian", city="Pensacola", state="FL") → submit
3. Redirected to `/properties/<id>` — details render
4. Click Edit → change name → save → updated
5. Click Delete → confirm → redirected to `/properties` (empty)

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(web): property list + create + edit + delete"
```

---

### Task 11: Unit types CRUD

**Files:**
- Modify: `apps/web/src/lib/validators.ts`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/units/page.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/units/actions.ts`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/units/units-client.tsx`

- [ ] **Step 1: Add unit validator**

Append to `apps/web/src/lib/validators.ts`:
```ts
export const unitTypeInput = z.object({
  name: z.string().min(1).max(100),
  bedrooms: z.coerce.number().int().min(0).max(10),
  bathrooms: z.coerce.number().min(0).max(10),
  sqftMin: z.coerce.number().int().min(0).optional().nullable(),
  sqftMax: z.coerce.number().int().min(0).optional().nullable(),
  priceMin: z.coerce.number().min(0).optional().nullable(),
  priceMax: z.coerce.number().min(0).optional().nullable(),
  availableCount: z.coerce.number().int().min(0).default(0),
  deposit: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});
export type UnitTypeInput = z.infer<typeof unitTypeInput>;
```

- [ ] **Step 2: Create server actions**

`apps/web/src/app/(dashboard)/properties/[id]/units/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { db, unitTypes, properties } from '@omnilease/db';
import { and, eq } from 'drizzle-orm';
import { requireOrg } from '@/lib/auth';
import { unitTypeInput, type UnitTypeInput } from '@/lib/validators';

async function assertPropertyBelongsToOrg(propertyId: string) {
  const { orgId } = await requireOrg();
  const [p] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) throw new Error('Property not found');
  return orgId;
}

export async function createUnitType(propertyId: string, input: UnitTypeInput) {
  await assertPropertyBelongsToOrg(propertyId);
  const data = unitTypeInput.parse(input);
  await db.insert(unitTypes).values({
    propertyId,
    name: data.name,
    bedrooms: data.bedrooms,
    bathrooms: String(data.bathrooms),
    sqftMin: data.sqftMin ?? null,
    sqftMax: data.sqftMax ?? null,
    priceMin: data.priceMin != null ? String(data.priceMin) : null,
    priceMax: data.priceMax != null ? String(data.priceMax) : null,
    availableCount: data.availableCount,
    deposit: data.deposit != null ? String(data.deposit) : null,
    description: data.description ?? null,
  });
  revalidatePath(`/properties/${propertyId}/units`);
}

export async function updateUnitType(propertyId: string, unitId: string, input: UnitTypeInput) {
  await assertPropertyBelongsToOrg(propertyId);
  const data = unitTypeInput.parse(input);
  await db
    .update(unitTypes)
    .set({
      name: data.name,
      bedrooms: data.bedrooms,
      bathrooms: String(data.bathrooms),
      sqftMin: data.sqftMin ?? null,
      sqftMax: data.sqftMax ?? null,
      priceMin: data.priceMin != null ? String(data.priceMin) : null,
      priceMax: data.priceMax != null ? String(data.priceMax) : null,
      availableCount: data.availableCount,
      deposit: data.deposit != null ? String(data.deposit) : null,
      description: data.description ?? null,
    })
    .where(and(eq(unitTypes.id, unitId), eq(unitTypes.propertyId, propertyId)));
  revalidatePath(`/properties/${propertyId}/units`);
}

export async function deleteUnitType(propertyId: string, unitId: string) {
  await assertPropertyBelongsToOrg(propertyId);
  await db
    .delete(unitTypes)
    .where(and(eq(unitTypes.id, unitId), eq(unitTypes.propertyId, propertyId)));
  revalidatePath(`/properties/${propertyId}/units`);
}
```

- [ ] **Step 3: Create units page (server component)**

`apps/web/src/app/(dashboard)/properties/[id]/units/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { db, properties, unitTypes } from '@omnilease/db';
import { and, eq, desc } from 'drizzle-orm';
import { requireOrg } from '@/lib/auth';
import { UnitsClient } from './units-client';

export default async function UnitsPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [p] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) notFound();

  const units = await db
    .select()
    .from(unitTypes)
    .where(eq(unitTypes.propertyId, id))
    .orderBy(desc(unitTypes.createdAt));

  return <UnitsClient propertyId={id} units={units} />;
}
```

- [ ] **Step 4: Create units client component**

`apps/web/src/app/(dashboard)/properties/[id]/units/units-client.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import type { UnitType } from '@omnilease/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { createUnitType, updateUnitType, deleteUnitType } from './actions';

export function UnitsClient({
  propertyId, units,
}: { propertyId: string; units: UnitType[] }) {
  const [editing, setEditing] = useState<UnitType | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const payload = {
      name: String(formData.get('name') ?? ''),
      bedrooms: Number(formData.get('bedrooms') ?? 0),
      bathrooms: Number(formData.get('bathrooms') ?? 0),
      sqftMin: numOrNull(formData.get('sqftMin')),
      sqftMax: numOrNull(formData.get('sqftMax')),
      priceMin: numOrNull(formData.get('priceMin')),
      priceMax: numOrNull(formData.get('priceMax')),
      availableCount: Number(formData.get('availableCount') ?? 0),
      deposit: numOrNull(formData.get('deposit')),
      description: String(formData.get('description') ?? '') || null,
    };
    startTransition(async () => {
      if (editing) await updateUnitType(propertyId, editing.id, payload);
      else await createUnitType(propertyId, payload);
      setOpen(false); setEditing(null);
    });
  }

  function del(id: string) {
    if (!confirm('Delete this unit type?')) return;
    startTransition(() => deleteUnitType(propertyId, id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Unit types</h2>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button>Add unit type</Button></DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit' : 'New'} unit type</DialogTitle>
            </DialogHeader>
            <form action={submit} className="space-y-3">
              <Field id="name" label="Name" defaultValue={editing?.name} required />
              <div className="grid grid-cols-2 gap-3">
                <Field id="bedrooms" label="Bedrooms" type="number" defaultValue={editing?.bedrooms} required />
                <Field id="bathrooms" label="Bathrooms" type="number" step="0.5" defaultValue={editing?.bathrooms} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field id="sqftMin" label="Sqft min" type="number" defaultValue={editing?.sqftMin ?? ''} />
                <Field id="sqftMax" label="Sqft max" type="number" defaultValue={editing?.sqftMax ?? ''} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field id="priceMin" label="Price min ($)" type="number" defaultValue={editing?.priceMin ?? ''} />
                <Field id="priceMax" label="Price max ($)" type="number" defaultValue={editing?.priceMax ?? ''} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field id="availableCount" label="Available" type="number" defaultValue={editing?.availableCount ?? 0} />
                <Field id="deposit" label="Deposit ($)" type="number" defaultValue={editing?.deposit ?? ''} />
              </div>
              <Field id="description" label="Description" defaultValue={editing?.description ?? ''} />
              <Button type="submit" disabled={isPending}>Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {units.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="py-10 text-center text-zinc-400">No unit types yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {units.map((u) => (
            <Card key={u.id} className="border-zinc-800 bg-zinc-900">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-sm text-zinc-400">
                    {u.bedrooms}BR/{u.bathrooms}BA · {u.availableCount} available ·
                    {u.priceMin ? ` $${u.priceMin}–$${u.priceMax ?? u.priceMin}` : ' —'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditing(u); setOpen(true); }}>Edit</Button>
                  <Button variant="destructive" size="sm" onClick={() => del(u.id)}>Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function Field(props: {
  id: string; label: string; required?: boolean; type?: string; step?: string;
  defaultValue?: string | number | null;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id} name={props.id} type={props.type ?? 'text'} step={props.step}
        required={props.required}
        defaultValue={props.defaultValue == null ? '' : String(props.defaultValue)}
        className="bg-zinc-950 border-zinc-800"
      />
    </div>
  );
}
```

- [ ] **Step 5: Manual E2E test**

Open a property → Units tab → click "Add unit type" → fill in "1BR/1BA", 1 bed, 1 bath, 700–850 sqft, $1,400–$1,600, 3 available → Save. Confirm row appears. Edit it. Delete it.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): unit type CRUD per property"
```

---

### Task 12: Knowledge base editor

**Files:**
- Modify: `apps/web/src/lib/validators.ts`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/knowledge/page.tsx`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/knowledge/actions.ts`
- Create: `apps/web/src/app/(dashboard)/properties/[id]/knowledge/knowledge-client.tsx`

- [ ] **Step 1: Add knowledge validators**

Append to `apps/web/src/lib/validators.ts`:
```ts
export const pricingKnowledge = z.object({
  specials: z.string().max(2000).optional().nullable(),
  applicationFee: z.coerce.number().min(0).optional().nullable(),
  adminFee: z.coerce.number().min(0).optional().nullable(),
  securityDepositNote: z.string().max(500).optional().nullable(),
});

export const petsKnowledge = z.object({
  allowed: z.boolean().default(true),
  weightLimitLbs: z.coerce.number().int().min(0).optional().nullable(),
  breedRestrictions: z.string().max(1000).optional().nullable(),
  deposit: z.coerce.number().min(0).optional().nullable(),
  monthlyPetRent: z.coerce.number().min(0).optional().nullable(),
  maxPets: z.coerce.number().int().min(0).optional().nullable(),
});

export const parkingKnowledge = z.object({
  surfaceIncluded: z.boolean().default(true),
  garageAvailable: z.boolean().default(false),
  garageMonthlyCost: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const amenitiesKnowledge = z.object({
  items: z.array(z.string().min(1).max(200)).default([]),
});

export const faqEntry = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(2000),
});
export const faqsKnowledge = z.object({
  entries: z.array(faqEntry).default([]),
});

export const knowledgeSchemas = {
  pricing: pricingKnowledge,
  pets: petsKnowledge,
  parking: parkingKnowledge,
  amenities: amenitiesKnowledge,
  faqs: faqsKnowledge,
} as const;
// Narrower type than DB's KnowledgeCategory — MVP only edits 5 of 9
// categories. Rename to avoid shadowing the DB export.
export type EditableKnowledgeCategory = keyof typeof knowledgeSchemas;
```

- [ ] **Step 2: Create server action**

`apps/web/src/app/(dashboard)/properties/[id]/knowledge/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { db, propertyKnowledge, properties } from '@omnilease/db';
import { and, eq } from 'drizzle-orm';
import { requireOrg } from '@/lib/auth';
import { knowledgeSchemas, type EditableKnowledgeCategory } from '@/lib/validators';

export async function upsertKnowledge(
  propertyId: string,
  category: EditableKnowledgeCategory,
  input: unknown,
) {
  const { orgId } = await requireOrg();
  const [p] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) throw new Error('Property not found');

  const schema = knowledgeSchemas[category];
  const content = schema.parse(input);

  // Upsert by (property_id, category)
  const [existing] = await db
    .select({ id: propertyKnowledge.id })
    .from(propertyKnowledge)
    .where(and(
      eq(propertyKnowledge.propertyId, propertyId),
      eq(propertyKnowledge.category, category),
    ))
    .limit(1);

  if (existing) {
    await db
      .update(propertyKnowledge)
      .set({ content, updatedAt: new Date() })
      .where(eq(propertyKnowledge.id, existing.id));
  } else {
    await db.insert(propertyKnowledge).values({ propertyId, category, content });
  }

  revalidatePath(`/properties/${propertyId}/knowledge`);
}
```

- [ ] **Step 3: Create knowledge page (server component)**

`apps/web/src/app/(dashboard)/properties/[id]/knowledge/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { db, properties, propertyKnowledge } from '@omnilease/db';
import { and, eq } from 'drizzle-orm';
import { requireOrg } from '@/lib/auth';
import { KnowledgeClient } from './knowledge-client';

export default async function KnowledgePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireOrg();
  const [p] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1);
  if (!p) notFound();

  const rows = await db
    .select()
    .from(propertyKnowledge)
    .where(eq(propertyKnowledge.propertyId, id));

  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.content]));

  return <KnowledgeClient propertyId={id} knowledge={byCategory} />;
}
```

- [ ] **Step 4: Create knowledge client component**

`apps/web/src/app/(dashboard)/properties/[id]/knowledge/knowledge-client.tsx`:
```tsx
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { upsertKnowledge } from './actions';

type KB = Record<string, unknown>;

export function KnowledgeClient({
  propertyId, knowledge,
}: { propertyId: string; knowledge: KB }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Knowledge base</h2>
      <Tabs defaultValue="pricing">
        <TabsList>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="pets">Pets</TabsTrigger>
          <TabsTrigger value="parking">Parking</TabsTrigger>
          <TabsTrigger value="amenities">Amenities</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
        </TabsList>
        <TabsContent value="pricing"><PricingForm propertyId={propertyId} value={knowledge.pricing as any} /></TabsContent>
        <TabsContent value="pets"><PetsForm propertyId={propertyId} value={knowledge.pets as any} /></TabsContent>
        <TabsContent value="parking"><ParkingForm propertyId={propertyId} value={knowledge.parking as any} /></TabsContent>
        <TabsContent value="amenities"><AmenitiesForm propertyId={propertyId} value={knowledge.amenities as any} /></TabsContent>
        <TabsContent value="faqs"><FaqsForm propertyId={propertyId} value={knowledge.faqs as any} /></TabsContent>
      </Tabs>
    </div>
  );
}

function SaveBar({ onSave, pending }: { onSave: () => void; pending: boolean }) {
  return <Button onClick={onSave} disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>;
}

function PricingForm({ propertyId, value }: { propertyId: string; value?: any }) {
  const [form, setForm] = useState(value ?? {});
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => upsertKnowledge(propertyId, 'pricing', form));
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Pricing & fees</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Labeled label="Current specials"><Textarea value={form.specials ?? ''} onChange={(e) => setForm({ ...form, specials: e.target.value })} /></Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Application fee ($)"><Input type="number" value={form.applicationFee ?? ''} onChange={(e) => setForm({ ...form, applicationFee: e.target.value })} /></Labeled>
          <Labeled label="Admin fee ($)"><Input type="number" value={form.adminFee ?? ''} onChange={(e) => setForm({ ...form, adminFee: e.target.value })} /></Labeled>
        </div>
        <Labeled label="Security deposit note"><Input value={form.securityDepositNote ?? ''} onChange={(e) => setForm({ ...form, securityDepositNote: e.target.value })} /></Labeled>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function PetsForm({ propertyId, value }: { propertyId: string; value?: any }) {
  const [form, setForm] = useState(value ?? { allowed: true });
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => upsertKnowledge(propertyId, 'pets', form));
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Pet policy</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.allowed} onChange={(e) => setForm({ ...form, allowed: e.target.checked })} />
          Pets allowed
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Weight limit (lbs)"><Input type="number" value={form.weightLimitLbs ?? ''} onChange={(e) => setForm({ ...form, weightLimitLbs: e.target.value })} /></Labeled>
          <Labeled label="Max pets"><Input type="number" value={form.maxPets ?? ''} onChange={(e) => setForm({ ...form, maxPets: e.target.value })} /></Labeled>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Pet deposit ($)"><Input type="number" value={form.deposit ?? ''} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></Labeled>
          <Labeled label="Monthly pet rent ($)"><Input type="number" value={form.monthlyPetRent ?? ''} onChange={(e) => setForm({ ...form, monthlyPetRent: e.target.value })} /></Labeled>
        </div>
        <Labeled label="Breed restrictions"><Textarea value={form.breedRestrictions ?? ''} onChange={(e) => setForm({ ...form, breedRestrictions: e.target.value })} /></Labeled>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function ParkingForm({ propertyId, value }: { propertyId: string; value?: any }) {
  const [form, setForm] = useState(value ?? { surfaceIncluded: true, garageAvailable: false });
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => upsertKnowledge(propertyId, 'parking', form));
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Parking</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.surfaceIncluded} onChange={(e) => setForm({ ...form, surfaceIncluded: e.target.checked })} />
          Surface parking included
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.garageAvailable} onChange={(e) => setForm({ ...form, garageAvailable: e.target.checked })} />
          Garage available
        </label>
        <Labeled label="Garage monthly cost ($)"><Input type="number" value={form.garageMonthlyCost ?? ''} onChange={(e) => setForm({ ...form, garageMonthlyCost: e.target.value })} /></Labeled>
        <Labeled label="Notes"><Textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Labeled>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function AmenitiesForm({ propertyId, value }: { propertyId: string; value?: any }) {
  const [items, setItems] = useState<string[]>(value?.items ?? []);
  const [draft, setDraft] = useState('');
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => upsertKnowledge(propertyId, 'amenities', { items }));
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Amenities</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="e.g. Pool, Gym, Dog park" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button type="button" onClick={() => { if (draft.trim()) { setItems([...items, draft.trim()]); setDraft(''); } }}>Add</Button>
        </div>
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between rounded bg-zinc-950 px-3 py-2 text-sm">
              <span>{item}</span>
              <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-red-400">Remove</button>
            </li>
          ))}
        </ul>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function FaqsForm({ propertyId, value }: { propertyId: string; value?: any }) {
  const [entries, setEntries] = useState<{ question: string; answer: string }[]>(value?.entries ?? []);
  const [isPending, startTransition] = useTransition();
  const save = () => startTransition(() => upsertKnowledge(propertyId, 'faqs', { entries }));
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">Custom FAQs</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {entries.map((e, i) => (
          <div key={i} className="space-y-2 rounded border border-zinc-800 p-3">
            <Input placeholder="Question" value={e.question} onChange={(ev) => {
              const next = [...entries]; next[i] = { ...next[i], question: ev.target.value }; setEntries(next);
            }} />
            <Textarea placeholder="Answer" value={e.answer} onChange={(ev) => {
              const next = [...entries]; next[i] = { ...next[i], answer: ev.target.value }; setEntries(next);
            }} />
            <Button variant="outline" size="sm" onClick={() => setEntries(entries.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setEntries([...entries, { question: '', answer: '' }])}>Add FAQ</Button>
        <SaveBar onSave={save} pending={isPending} />
      </CardContent>
    </Card>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Manual E2E test**

Navigate to a property's Knowledge tab. Fill in each category. Save. Refresh — values persist. Verify in Neon:
```sql
SELECT category, content FROM property_knowledge WHERE property_id = '<id>';
```

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): property knowledge base editor (pricing/pets/parking/amenities/faqs)"
```

---

### Task 13: Deploy to Vercel + smoke test

**Files:**
- Create: `vercel.json` (optional — only if custom settings needed)
- Modify: `.gitignore` (add `.vercel`)

- [ ] **Step 1: Link Vercel project**

Run from repo root:
```bash
vercel link
```
Choose the correct scope + new project name `omnilease-web`. When prompted for the root directory, use `apps/web`.

- [ ] **Step 2: Pull env vars and push new ones**

```bash
cd apps/web
vercel env pull .env.local
```

If Neon and Clerk env vars aren't already in Vercel, add them:
```bash
vercel env add DATABASE_URL production
vercel env add DATABASE_URL preview
vercel env add DATABASE_URL development
vercel env add CLERK_SECRET_KEY production
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel env add NEXT_PUBLIC_CLERK_SIGN_IN_URL production  # value: /sign-in
vercel env add NEXT_PUBLIC_CLERK_SIGN_UP_URL production  # value: /sign-up
vercel env add NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL production  # value: /onboarding
vercel env add NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL production  # value: /onboarding
```

- [ ] **Step 3: Verify build locally**

Run from repo root:
```bash
pnpm build
```
Expected: `@omnilease/web` builds successfully (no type errors, all routes compiled).

- [ ] **Step 4: Deploy preview**

```bash
cd apps/web
vercel
```
Expected: preview URL returned. Visit it — landing page loads.

- [ ] **Step 5: E2E smoke test on preview**

On the preview URL:
1. `/sign-up` → create account
2. Verify `/onboarding` shows org creation
3. Create org "Gulf Breeze Holdings"
4. Redirects to `/dashboard` — properties count = 0
5. Create property "The Meridian" (Pensacola, FL)
6. Add a unit type (1BR/1BA, $1500–$1700, 3 available)
7. Fill in Pets knowledge (allowed, 75lb limit, $300 deposit, $35/mo)
8. Verify in Neon console: rows exist in `organizations`, `users`, `properties`, `unit_types`, `property_knowledge`

- [ ] **Step 6: Deploy production**

```bash
vercel --prod
```

- [ ] **Step 7: Commit + tag**

```bash
git add .vercel/project.json 2>/dev/null || true
git add -u
git commit -m "chore: vercel project link" --allow-empty
git tag phase1-foundation-mvp
```

---

## Phase 1 Foundation — Done definition

- [ ] User can sign up, create an organization, and arrive at `/dashboard`
- [ ] User can create, edit, view, and delete properties scoped to their org
- [ ] User can add, edit, and delete unit types per property
- [ ] User can configure pricing, pets, parking, amenities, and FAQ knowledge per property
- [ ] All queries filter by `orgId` derived from `requireOrg()`
- [ ] Deployed to Vercel with Neon + Clerk
- [ ] `pnpm test` passes (schema tests + validator tests)
- [ ] `pnpm build` succeeds

## What's next — Plan 2 preview

Plan 2 (Weeks 3–4) will add:
- Twilio phone number per property + webhook signature verification
- Inbound SMS webhook → enqueue to Upstash-backed queue
- Claude conversation engine (Anthropic SDK) reading from the knowledge tables built here
- System prompt builder assembling property context
- Escalation detection + Slack/SMS notification to assigned agent
- TCPA opt-out keyword handling (STOP/UNSUBSCRIBE/CANCEL)
- Outbound SMS via Twilio, logging to `messages` + cost tracking

Plan 3 (Weeks 5–6) will add:
- Embeddable React webchat widget (WebSocket + localStorage session)
- Conversation viewer in dashboard
- Escalation queue page
- Basic analytics (count, response time, escalation rate)
- Pilot property deploy + playbook
